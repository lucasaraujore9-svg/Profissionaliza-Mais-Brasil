import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import type { CourseSplitStatus } from "@prisma/client"

/**
 * EVENTOS DE SPLIT DO ASAAS.
 *
 * Antes destes handlers os tres `PAYMENT_SPLIT_*` ja existiam no union de tipos
 * e caiam no `default:` silencioso dos dois processadores — ou seja, o rateio
 * podia ser RECUSADO ou BLOQUEADO e o extrato aqui continuaria dizendo
 * "pendente" para sempre, sem ninguem saber que o produtor nao recebeu.
 *
 * O caso que mais importa e o `DIVERGENCE_BLOCK`: o Asaas concede **2 dias
 * uteis** para ajustar o split antes de CANCELA-LO sozinho e liberar o valor
 * inteiro para quem emitiu a cobranca. Passado o prazo em silencio, o produtor
 * simplesmente perde o dinheiro daquela venda.
 */

/** Eventos de split que este modulo trata. */
export const SPLIT_EVENTS = [
  "PAYMENT_SPLIT_DONE",
  "PAYMENT_SPLIT_CANCELLED",
  "PAYMENT_SPLIT_DIVERGENCE_BLOCK",
  "PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED",
] as const

export type SplitEvent = (typeof SPLIT_EVENTS)[number]

export function isSplitEvent(event: string): event is SplitEvent {
  return (SPLIT_EVENTS as readonly string[]).includes(event)
}

interface SplitEventPayload {
  /** Id da cobranca no Asaas — casa com `Payment.asaasPaymentId`. */
  asaasPaymentId: string | null
  /** Id do split individual, quando o evento identifica um (additionalInfo). */
  splitId: string | null
  /**
   * Tenant DONO da conta Asaas que enviou este webhook (null = conta-mae PMB).
   *
   * `asaasPaymentId` e unico no NOSSO banco, mas quem manda o evento e uma conta
   * Asaas especifica: sem comparar, o webhook de uma unidade atualizaria o
   * extrato de rateio de outra. Todo o resto de `reseller-process.ts` escopa as
   * consultas por `tenantId: tenant.id` — este era o unico ponto que nao.
   */
  tenantId: string | null
  /** Splits que vieram no corpo da cobranca, quando houver. */
  splits?: {
    id: string
    walletId: string
    status: string
    refusalReason: string | null
  }[]
}

const STATUS_BY_ASAAS: Record<string, CourseSplitStatus> = {
  PENDING: "PENDING",
  AWAITING_CREDIT: "AWAITING_CREDIT",
  DONE: "DONE",
  REFUSED: "REFUSED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
}

/**
 * Aplica um evento de split ao extrato.
 *
 * Best-effort por design: nada aqui pode derrubar o webhook, porque o mesmo
 * evento tambem carrega a liberacao de acesso do aluno. Um extrato defasado e
 * recuperavel (a conciliacao com `GET /v3/payments/splits/paid` fecha depois);
 * um aluno que pagou e nao recebeu acesso, nao.
 *
 * Devolve o texto que vai para o `WebhookLog`.
 */
export async function applySplitEvent(
  event: SplitEvent,
  payload: SplitEventPayload,
): Promise<string> {
  // O isolamento que o cabecalho promete: `reseller-process.ts` RELANCA tudo,
  // entao um erro transitorio de banco aqui faria o webhook inteiro responder
  // 500 e o Asaas reentregar — reprocessando a liberacao de acesso do aluno por
  // causa de uma linha de extrato.
  try {
    return await applySplitEventInner(event, payload)
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "course_authoring.split_event_failed",
        asaasEvent: event,
        asaasPaymentId: payload.asaasPaymentId,
      },
      "falha ao aplicar evento de split ao extrato",
    )
    return `${event} — falha ao atualizar o extrato de rateio (registrada no log)`
  }
}

async function applySplitEventInner(
  event: SplitEvent,
  payload: SplitEventPayload,
): Promise<string> {
  const { asaasPaymentId, splitId } = payload

  if (!asaasPaymentId) return `${event} — sem cobranca identificada`

  const payment = await prisma.payment.findUnique({
    where: { asaasPaymentId },
    select: { id: true, tenantId: true },
  })
  // Cobranca de mensalidade da unidade, ou venda anterior ao rateio: nao ha
  // extrato a atualizar. Nao e erro.
  if (!payment) return `${event} — cobranca ${asaasPaymentId} sem rateio aqui`

  // A cobranca tem que pertencer a conta que mandou o evento.
  if (payment.tenantId !== payload.tenantId) {
    contextLogger().warn(
      {
        event: "course_authoring.split_event_tenant_mismatch",
        asaasPaymentId,
        paymentTenantId: payment.tenantId,
        webhookTenantId: payload.tenantId,
      },
      "evento de split de uma conta Asaas para cobranca de outra unidade",
    )
    return `${event} — cobranca ${asaasPaymentId} nao pertence a esta conta`
  }

  const lines = await prisma.courseSaleSplit.findMany({
    where: { paymentId: payment.id },
    select: {
      id: true,
      role: true,
      asaasSplitId: true,
      walletId: true,
      beneficiaryTenantId: true,
    },
  })
  if (lines.length === 0) return `${event} — pagamento sem linhas de rateio`

  // Bloqueio por divergencia nao e por LINHA: e a cobranca inteira que fica
  // retida. Alerta o SUPER_ADMIN sem `category` — este aviso nao pode ser
  // silenciado por preferencia de notificacao, porque tem prazo.
  if (event === "PAYMENT_SPLIT_DIVERGENCE_BLOCK") {
    contextLogger().error(
      { event: "course_authoring.split_divergence_block", asaasPaymentId },
      "Asaas bloqueou o rateio por divergencia — 2 dias uteis para ajustar",
    )
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "ERROR",
      title: "Rateio bloqueado pelo Asaas",
      body: `A cobranca ${asaasPaymentId} teve o split bloqueado por divergencia de valor. O Asaas concede 2 dias uteis para ajuste; passado o prazo o rateio e CANCELADO e o valor fica inteiro com quem emitiu a cobranca.`,
      href: "/admin/financeiro",
    }).catch(swallow("course_authoring.split_divergence"))
    return `${event} — ${asaasPaymentId} bloqueado, SUPER_ADMIN notificado`
  }

  if (event === "PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED") {
    // O prazo expirou: o Asaas cancela os splits e credita tudo ao emissor.
    await prisma.courseSaleSplit.updateMany({
      where: { paymentId: payment.id, status: { in: ["PENDING", "AWAITING_CREDIT"] } },
      data: { status: "CANCELLED", refusalReason: "Prazo de ajuste do split expirado" },
    })
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "ERROR",
      title: "Rateio cancelado por prazo",
      body: `O prazo de ajuste do split da cobranca ${asaasPaymentId} expirou. O produtor NAO recebeu o repasse desta venda — e preciso acertar por fora.`,
      href: "/admin/financeiro",
    }).catch(swallow("course_authoring.split_divergence"))
    return `${event} — rateio de ${asaasPaymentId} cancelado por prazo`
  }

  // Os demais eventos identificam UM split. `splitId` vem em
  // `additionalInfo.splitId`; quando ele falta, o corpo da cobranca costuma
  // trazer o array `splits` e casamos por carteira.
  const status: CourseSplitStatus =
    event === "PAYMENT_SPLIT_DONE" ? "DONE" : "CANCELLED"

  if (splitId) {
    const known = lines.find((l) => l.asaasSplitId === splitId)
    if (known) {
      await prisma.courseSaleSplit.update({
        where: { id: known.id },
        data: { status, settledAt: status === "DONE" ? new Date() : null },
      })
      return `${event} — split ${splitId} => ${status}`
    }
  }

  // Sem `splitId` reconhecido: usa o array da cobranca para casar por carteira e
  // de quebra CARIMBA o `asaasSplitId`, que a criacao da cobranca nao devolve
  // em todos os fluxos. Sem esse carimbo o evento seguinte tambem nao casaria.
  const remote = payload.splits ?? []
  let touched = 0
  for (const line of lines) {
    const match = remote.find((r) => r.walletId && r.walletId === line.walletId)
    if (!match) continue
    await prisma.courseSaleSplit.update({
      where: { id: line.id },
      data: {
        asaasSplitId: match.id,
        status: STATUS_BY_ASAAS[match.status] ?? status,
        refusalReason: match.refusalReason,
        settledAt: match.status === "DONE" ? new Date() : null,
      },
    })
    touched += 1
  }

  return touched > 0
    ? `${event} — ${touched} linha(s) de rateio atualizada(s)`
    : `${event} — nenhuma linha casou (${splitId ?? "sem splitId"})`
}

/**
 * Extrai o `splitId` do payload do webhook.
 *
 * O Asaas entrega o identificador do split liquidado dentro de
 * `additionalInfo.splitId` — e nao na raiz, como seria de esperar num evento
 * chamado PAYMENT_SPLIT_DONE. Sem ele, uma cobranca com mais de uma linha nao
 * teria como saber QUAL delas o evento fecha.
 */
export function splitIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const info = (payload as { additionalInfo?: unknown }).additionalInfo
  if (!info || typeof info !== "object") return null
  const id = (info as { splitId?: unknown }).splitId
  return typeof id === "string" && id.length > 0 ? id : null
}
