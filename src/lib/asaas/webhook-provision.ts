import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"
import { asaasWebhookUrl, appDomain } from "@/lib/tenant/urls"
import {
  AsaasApiError,
  createWebhook,
  decryptTenantAsaasKey,
  listWebhooks,
  removeWebhookBackoff,
  updateWebhook,
} from "./client"
import type {
  AsaasWebhookConfig,
  AsaasWebhookConfigInput,
  AsaasWebhookEvent,
} from "./types"

/**
 * Registro do webhook na conta Asaas DA UNIDADE.
 *
 * Por que isto existe: no Asaas o webhook é da CONTA, não da cobrança —
 * `notificationUrl` não faz parte do DTO de criação de cobrança/assinatura e é
 * descartado sem erro. Enquanto o registro dependeu de a unidade criá-lo à mão
 * no painel do Asaas, nenhuma das contas de revenda em produção chegou a
 * notificar uma única vez: toda venda por PIX/boleto ficava PENDING para sempre,
 * com o aluno pagando e não recebendo acesso. Aqui fazemos o registro nós
 * mesmos, com a URL e o token certos, e conseguimos dizer se ele está de pé.
 */

/**
 * Só os eventos que o `processResellerAsaasWebhook` realmente trata. Assinar
 * tudo geraria entrega (e risco de penalização da fila) por evento que vira
 * no-op — inclusive os ruidosos `PAYMENT_CHECKOUT_VIEWED`/`PAYMENT_UPDATED`.
 */
export const RESELLER_WEBHOOK_EVENTS: AsaasWebhookEvent[] = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
  "PAYMENT_CHARGEBACK_REQUESTED",
]

const WEBHOOK_NAME = "Profissionaliza Mais Brasil"

export interface TenantWebhookTarget {
  id: string
  slug: string
  /** API key da conta Asaas da unidade, CRIPTOGRAFADA (como está no banco). */
  asaasApiKey: string | null
  /** E-mail que o Asaas avisa quando a fila começa a falhar. */
  notifyEmail?: string | null
}

export type WebhookProvisionResult =
  | {
      ok: true
      /** true = criado agora; false = já existia e foi corrigido/reafirmado. */
      created: boolean
      webhookId: string
      url: string
    }
  | {
      ok: false
      code: "NOT_CONNECTED" | "NO_PERMISSION" | "ASAAS_ERROR" | "TOKEN_NOT_SAVED"
      message: string
    }

export interface WebhookStatus {
  /** Existe um webhook apontando para a nossa URL nesta conta? */
  configured: boolean
  /** Está ativo E com a fila liberada (o que de fato entrega eventos). */
  healthy: boolean
  enabled: boolean
  interrupted: boolean
  penalizedRequestsCount: number
  /** URL registrada lá (pode divergir da nossa quando foi criado à mão). */
  url: string | null
  /** URL que ele deveria ter. */
  expectedUrl: string
  /** Faltam eventos que o nosso processador precisa? */
  missingEvents: AsaasWebhookEvent[]
  /** Não deu para consultar a conta (chave inválida/sem permissão/fora do ar). */
  unavailable?: { code: string; message: string }
}

/**
 * O Asaas exige um e-mail no cadastro do webhook (é para lá que ele avisa quando
 * a fila começa a falhar). Preferimos um endereço da própria unidade — quem
 * precisa saber que as vendas pararam de confirmar é ela.
 */
function notificationEmail(tenant: TenantWebhookTarget): string {
  const own = tenant.notifyEmail?.trim()
  if (own && own.includes("@")) return own
  const smtp = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ""
  const match = smtp.match(/<([^>]+)>/)
  const address = (match?.[1] ?? smtp).trim()
  if (address.includes("@")) return address
  return `no-reply@${appDomain()}`
}

/**
 * Token de autenticação do webhook. O Asaas exige 32+ caracteres — o campo do
 * painel aceitava 8, então um token digitado à mão podia sequer ser aceito lá.
 */
function generateAuthToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Slug em `?tenant=` da URL de um webhook, ou null quando não há. */
export function webhookTenantSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/[?&]tenant=([a-z0-9_-]+)/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Localiza o webhook DESTA unidade na conta. Casa pela URL exata e, se não
 * achar, por um webhook que aponte para o nosso endpoint **com o `?tenant=`
 * desta mesma unidade** — é assim que corrigimos o registro feito à mão com a
 * URL quase certa (apex em vez do www, barra sobrando), que toma 401 em toda
 * entrega.
 *
 * O QUE ELE NUNCA PODE ADOTAR: um webhook do nosso endpoint SEM `?tenant=`.
 * Essa é a assinatura do webhook GLOBAL da PMB, e o fallback antigo
 * (`url.includes("/api/webhooks/asaas")`) casava com ele. Isso só é inofensivo
 * enquanto cada unidade tem a própria conta Asaas — mas há unidade PRÓPRIA da
 * PMB que usa deliberadamente a MESMA conta-mãe, para o dinheiro cair no mesmo
 * caixa. Nela, `listWebhooks` devolve o webhook global da PMB, e o `ensure`
 * seguinte faria `updateWebhook` nele: reescreveria a URL para `?tenant=<slug>`,
 * trocaria o `authToken` (que é a env `ASAAS_WEBHOOK_TOKEN`) por um token
 * gerado, e reduziria os eventos aos 6 de revenda. Resultado: a mensalidade da
 * REDE INTEIRA deixaria de processar. Como o cron diário reexecuta o `ensure`
 * sempre que o estado não está saudável, era um sorteio repetido todo dia.
 *
 * Não achar nada é o resultado certo nesse caso: o `ensure` cria um webhook
 * novo, ao lado do global, em vez de sequestrá-lo.
 */
function findOurWebhook(
  all: AsaasWebhookConfig[],
  expectedUrl: string,
  slug: string,
): AsaasWebhookConfig | null {
  const exact = all.find((w) => w.url?.trim() === expectedUrl)
  if (exact) return exact
  return (
    all.find(
      (w) =>
        (w.url ?? "").includes("/api/webhooks/asaas") &&
        webhookTenantSlug(w.url) === slug.toLowerCase(),
    ) ?? null
  )
}

function buildInput(
  tenant: TenantWebhookTarget,
  authToken: string,
): AsaasWebhookConfigInput {
  return {
    name: WEBHOOK_NAME,
    url: asaasWebhookUrl(tenant.slug),
    email: notificationEmail(tenant),
    enabled: true,
    // `interrupted: false` é o que RELIGA a fila que o Asaas pausou sozinho após
    // uma sequência de falhas (ex.: enquanto a URL estava errada).
    interrupted: false,
    apiVersion: 3,
    authToken,
    // NON_SEQUENTIALLY de propósito: no modo sequencial um único evento problemático
    // trava a fila inteira daquela conta. O nosso fulfill é idempotente e
    // serializado por advisory lock no id do pagamento, então entrega paralela é
    // segura e não deixa venda parada atrás de um evento ruim.
    sendType: "NON_SEQUENTIALLY",
    events: RESELLER_WEBHOOK_EVENTS,
  }
}

function toResult(err: unknown): WebhookProvisionResult {
  if (err instanceof AsaasApiError) {
    const description = err.errors?.[0]?.description
    // 401 = chave inválida; 403 = chave sem escopo de configuração.
    if (err.statusCode === 401 || err.statusCode === 403) {
      return {
        ok: false,
        code: "NO_PERMISSION",
        message:
          description ??
          "A API key informada não tem permissão para configurar webhooks nesta conta Asaas.",
      }
    }
    return {
      ok: false,
      code: "ASAAS_ERROR",
      message: description ?? `Asaas respondeu ${err.statusCode}`,
    }
  }
  return {
    ok: false,
    code: "ASAAS_ERROR",
    message: "Não foi possível falar com o Asaas agora.",
  }
}

/**
 * Garante que a conta Asaas da unidade tenha um webhook ativo apontando para
 * nós, com um token forte que passa a ser a fonte da verdade do nosso receiver.
 *
 * Idempotente: pode ser chamada quantas vezes for preciso. Cria se não existir,
 * corrige URL/eventos/token se existir, e tira a fila do backoff quando o Asaas
 * a penalizou.
 *
 * Ordem das escritas: primeiro o Asaas, depois o nosso banco. Se o banco falhar,
 * devolvemos `TOKEN_NOT_SAVED` em vez de fingir sucesso — nesse estado a conta
 * assina com um token que não reconhecemos, e a correção é repetir a operação
 * (a repetição regrava os dois lados e converge).
 */
export async function ensureTenantAsaasWebhook(
  tenant: TenantWebhookTarget,
): Promise<WebhookProvisionResult> {
  if (!tenant.asaasApiKey) {
    return {
      ok: false,
      code: "NOT_CONNECTED",
      message: "Conecte a API key do Asaas antes de configurar o webhook.",
    }
  }

  const log = contextLogger()
  const expectedUrl = asaasWebhookUrl(tenant.slug)
  const authToken = generateAuthToken()

  let apiKey: string
  try {
    apiKey = decryptTenantAsaasKey(tenant.asaasApiKey)
  } catch (err) {
    log.error(
      { err, event: "asaas.webhook_provision.decrypt_failed", tenantId: tenant.id },
      "falha ao descriptografar a API key Asaas da unidade",
    )
    return {
      ok: false,
      code: "NOT_CONNECTED",
      message: "Não foi possível ler a API key salva. Reconecte a conta Asaas.",
    }
  }

  let webhook: AsaasWebhookConfig
  let created: boolean
  try {
    const existing = await listWebhooks(apiKey)
    const ours = findOurWebhook(existing.data ?? [], expectedUrl, tenant.slug)
    const input = buildInput(tenant, authToken)

    if (ours) {
      webhook = await updateWebhook(ours.id, input, apiKey)
      created = false
      // `interrupted: false` no PUT religa a fila, mas a penalização por falhas
      // repetidas é um estado separado — sem removê-la, a entrega segue represada.
      if (ours.interrupted || (ours.penalizedRequestsCount ?? 0) > 0) {
        await removeWebhookBackoff(ours.id, apiKey).catch((err) => {
          log.warn(
            {
              err,
              event: "asaas.webhook_provision.backoff_not_removed",
              tenantId: tenant.id,
              webhookId: ours.id,
            },
            "não foi possível remover o backoff do webhook",
          )
        })
      }
    } else {
      webhook = await createWebhook(input, apiKey)
      created = true
    }
  } catch (err) {
    log.error(
      {
        err,
        event: "asaas.webhook_provision.failed",
        tenantId: tenant.id,
        slug: tenant.slug,
      },
      "registro do webhook na conta Asaas da unidade falhou",
    )
    return toResult(err)
  }

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { asaasWebhookToken: encrypt(authToken) },
    })
  } catch (err) {
    log.error(
      {
        err,
        event: "asaas.webhook_provision.token_not_saved",
        tenantId: tenant.id,
        webhookId: webhook.id,
      },
      "webhook registrado no Asaas mas o token não foi salvo — repetir a operação",
    )
    return {
      ok: false,
      code: "TOKEN_NOT_SAVED",
      message:
        "O webhook foi criado no Asaas, mas não conseguimos salvar o token aqui. Clique novamente para concluir.",
    }
  }

  log.info(
    {
      event: "asaas.webhook_provision.ok",
      tenantId: tenant.id,
      slug: tenant.slug,
      webhookId: webhook.id,
      created,
    },
    "webhook da conta Asaas da unidade registrado",
  )

  return { ok: true, created, webhookId: webhook.id, url: expectedUrl }
}

/**
 * Estado REAL do webhook na conta da unidade — o que o painel deve mostrar no
 * lugar de "token preenchido". Ter um token salvo nunca provou que a conta
 * notifica; foi exatamente essa confusão que deixou unidades vendendo com o
 * selo "Conectado" e nenhuma venda confirmando.
 */
export async function inspectTenantAsaasWebhook(
  tenant: TenantWebhookTarget,
): Promise<WebhookStatus> {
  const expectedUrl = asaasWebhookUrl(tenant.slug)
  const empty: WebhookStatus = {
    configured: false,
    healthy: false,
    enabled: false,
    interrupted: false,
    penalizedRequestsCount: 0,
    url: null,
    expectedUrl,
    missingEvents: RESELLER_WEBHOOK_EVENTS,
  }

  if (!tenant.asaasApiKey) return empty

  let apiKey: string
  try {
    apiKey = decryptTenantAsaasKey(tenant.asaasApiKey)
  } catch {
    return {
      ...empty,
      unavailable: {
        code: "NOT_CONNECTED",
        message: "Não foi possível ler a API key salva. Reconecte a conta Asaas.",
      },
    }
  }

  try {
    const all = await listWebhooks(apiKey)
    const ours = findOurWebhook(all.data ?? [], expectedUrl, tenant.slug)
    if (!ours) return empty

    const events = ours.events ?? []
    const missingEvents = RESELLER_WEBHOOK_EVENTS.filter(
      (e) => !events.includes(e),
    )
    // "Configurado" exige a URL certa: um webhook apontando para o lugar errado
    // existe, mas toma 401 em toda entrega — na prática é o mesmo que não ter.
    const urlOk = ours.url?.trim() === expectedUrl
    return {
      configured: urlOk,
      healthy:
        urlOk &&
        ours.enabled &&
        !ours.interrupted &&
        missingEvents.length === 0 &&
        ours.hasAuthToken,
      enabled: Boolean(ours.enabled),
      interrupted: Boolean(ours.interrupted),
      penalizedRequestsCount: ours.penalizedRequestsCount ?? 0,
      url: ours.url ?? null,
      expectedUrl,
      missingEvents,
    }
  } catch (err) {
    const asaas = err instanceof AsaasApiError ? err : null
    return {
      ...empty,
      unavailable: {
        code: asaas?.statusCode === 401 || asaas?.statusCode === 403
          ? "NO_PERMISSION"
          : "ASAAS_ERROR",
        message:
          asaas?.errors?.[0]?.description ??
          "Não foi possível consultar os webhooks desta conta Asaas agora.",
      },
    }
  }
}
