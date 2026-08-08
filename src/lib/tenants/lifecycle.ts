/**
 * Ciclo de vida comercial da unidade: quem JÁ FOI cliente pagante e quem nunca
 * chegou a ser.
 *
 * Resolve dois problemas de uma vez, com o mesmo predicado:
 *
 * 1. CHURN HONESTO. A taxa era `canceladas / total` — um snapshot lifetime que
 *    não perguntava se a unidade algum dia pagou. Unidade que nasceu cortesia,
 *    ganhou prazo esticado e foi suspensa antes do primeiro boleto entrava no
 *    numerador como cliente perdido; e `PENDING` que nunca pagou inflava o
 *    denominador. Medido em 07/08/2026: 9,5% viravam 4,4% com o recorte certo.
 *
 * 2. CORTESIA EXCEPCIONAL ("blacklist"). Unidade suspensa/cancelada que nunca
 *    pagou não pode ser reativada de graça, com prazo esticado ou com promoção
 *    — só com a permissão `unidades.cortesiaExcepcional` (super admin) e
 *    justificativa. Pagar continua liberando normalmente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O PREDICADO É SÓ "NUNCA PAGOU"
 *
 * O pedido original listava três situações — nunca pagou, cortesia (planValue
 * 0), primeira cobrança com vencimento lá na frente. As três COLAPSAM em "nunca
 * pagou": cortesia não gera cobrança no Asaas, e cobrança que nunca venceu não
 * foi paga. Manter as outras duas como cláusulas independentes seria pior:
 *
 *   - `planValue` é o valor de HOJE. A rota de billing o sobrescreve sem
 *     histórico, então unidade que pagou 6 meses, virou cortesia e só depois
 *     cancelou — churn REAL — seria classificada como "nunca ativou".
 *   - "1ª cobrança nunca venceu" nem sempre é consultável: cancelar a unidade
 *     apaga as cobranças em aberto (viram DELETING/DELETED).
 *
 * "Nunca pagou" é monotônico: uma vez verdadeiro, só vira falso quando ela paga.
 * Blacklist precisa disso — critério que oscila com o dado de hoje bloquearia e
 * desbloquearia sozinho.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `Tenant.activatedAt` NÃO ENTRA AQUI  ← não "conserte" isto
 *
 * É tentador usá-lo como reforço: em tese só `PAYMENT_RECEIVED`/`CONFIRMED` o
 * grava (src/lib/asaas/process.ts), logo `activatedAt != null` provaria
 * pagamento. NÃO PROVA. A migration `20260620_referral_commission_tiers` fez
 * backfill com `COALESCE(MIN(paid_at), created_at)` — o fallback para
 * `created_at` carimbou a coluna em TODA unidade que já existia, pagante ou não.
 * Medido em produção: 12 unidades têm `activated_at = created_at` sem nenhuma
 * cobrança paga. Incluí-lo resgataria essas 12 do "Nunca ativou" e devolveria o
 * churn a 9,7% — ou seja, anularia a mudança.
 *
 * O ledger `tenant_payments`, esse sim, é confiável: verificado em produção que
 * NENHUMA cobrança paga virou `DELETED` (`status='DELETED' AND paid_at IS NOT
 * NULL` → 0 linhas). `DELETED` é sempre cobrança em aberto removida do Asaas no
 * cancelamento.
 */
import type { Prisma, TenantStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { PAID_STATUSES } from "@/lib/tenant-billing/types"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { brDayStartUtc } from "@/lib/dates"
import { normalizePhone } from "@/lib/validation/phone"

/**
 * Status de cobrança que contam como dinheiro que entrou.
 *
 * `RECEIVED_IN_CASH` (baixa manual no painel do Asaas) não está em
 * `PAID_STATUSES` — aquela constante alimenta /painel/cobrancas e o cron de
 * lembretes, cujo raio de explosão é outro. Mas o resto do repo já o trata como
 * pago (`pay-card/route.ts`, `fix-gateway-collapse/route.ts`,
 * `transparent-process.ts`), e uma unidade que pagou em dinheiro não pode cair
 * na blacklist. Zero linhas em produção hoje — é blindagem, não correção.
 *
 * ATENÇÃO: esta lista é espelhada no índice parcial
 * `tenant_payments_ever_paid_tenant_idx`. Mudar aqui pede migration nova, senão
 * o Postgres deixa de usar o índice (predicado da query tem que implicar o dele).
 */
export const EVER_PAID_STATUSES = [...PAID_STATUSES, "RECEIVED_IN_CASH"] as const

/**
 * Uma cobrança que representa dinheiro que ENTROU alguma vez.
 *
 * `paidAt` está aqui porque `status` é MUTÁVEL e não guarda história:
 * `asaas/process.ts` faz upsert de `status: payment.status` para todo evento
 * roteado, então um estorno, estorno parcial ou chargeback reescreve a MESMA
 * linha que era `RECEIVED` e ela sai da lista de status pagos. Sem `paidAt`, uma
 * unidade que pagou de verdade voltaria a ler como "nunca pagou": sairia da base
 * do churn, apareceria em "Nunca ativou" e receberia 403 ao ser reativada — e o
 * cabeçalho deste módulo promete justamente o contrário, que o predicado é
 * MONOTÔNICO. `paidAt` só é gravado quando o pagamento foi confirmado e
 * sobrevive às transições seguintes.
 */
export const EVER_PAID_PAYMENT_WHERE: Prisma.TenantPaymentWhereInput = {
  OR: [
    { status: { in: [...EVER_PAID_STATUSES] } },
    // Baixa manual do financeiro da PMB (PIX/espécie fora do Asaas).
    { markedPaidAt: { not: null } },
    // Prova imutável de que o dinheiro entrou, sobrevive a estorno/chargeback.
    { paidAt: { not: null } },
  ],
}

/** Unidade que nunca teve nenhuma mensalidade paga. */
export const NEVER_PAID_TENANT_WHERE: Prisma.TenantWhereInput = {
  tenantPayments: { none: EVER_PAID_PAYMENT_WHERE },
}

/** Unidade que já pagou ao menos uma mensalidade. */
export const EVER_PAID_TENANT_WHERE: Prisma.TenantWhereInput = {
  tenantPayments: { some: EVER_PAID_PAYMENT_WHERE },
}

/** Os estados em que a unidade está fora do ar. */
export const INACTIVE_STATUSES = ["SUSPENDED", "CANCELLED"] as const

/**
 * "Nunca ativou": está fora do ar e nunca pagou. Sai do churn (não é cliente
 * perdido — é cliente que nunca começou) e é o gatilho da cortesia excepcional.
 */
export const NEVER_ACTIVATED_WHERE: Prisma.TenantWhereInput = {
  status: { in: [...INACTIVE_STATUSES] },
  ...NEVER_PAID_TENANT_WHERE,
}

/**
 * Valor do filtro `?status=` da lista de /admin/revendedores para este balde.
 *
 * Não é um `TenantStatus` — é um recorte que cruza status e histórico de
 * pagamento. Fica aqui, junto do `where` que ele representa, para a rota e o
 * cliente não divergirem numa string solta.
 */
export const NUNCA_ATIVOU_FILTER = "NUNCA_ATIVOU"

/**
 * População do churn: quem já foi cliente pagante, sem o placeholder da vitrine
 * PMB. Numerador e denominador saem daqui — `CANCELLED ∩ base / base`.
 */
export const CHURN_BASE_WHERE: Prisma.TenantWhereInput = {
  slug: { not: PMB_TENANT_SLUG },
  ...EVER_PAID_TENANT_WHERE,
}

/**
 * Prazo padrão da 1ª cobrança na criação da unidade (hoje espalhado como
 * `isoDayPlus(3)` em `resellers/create.ts`, `revendedores/[id]/billing` e
 * `revendedores/cadastro`).
 */
export const DEFAULT_FIRST_DUE_DAYS = 3

/**
 * Folga além do padrão antes de um vencimento virar "prazo esticado".
 *
 * O limite efetivo é D+10. Calibrado nos casos reais que motivaram o pedido:
 * `valedosaber` nasceu com a 1ª cobrança em D+20, `andersoncidade` em D+15,
 * `concluirconsultoriaeducacional` em D+11 — nenhuma pagou. D+7 e abaixo
 * cobre o legítimo "combinei que ele paga na sexta".
 */
export const CORTESIA_GRACE_DAYS = 7

/** Vencimento a partir do qual o prazo é considerado esticado. */
export const MAX_DUE_DAYS_AHEAD = DEFAULT_FIRST_DUE_DAYS + CORTESIA_GRACE_DAYS

/** O que, na intenção da requisição, dispara o gate. */
export type CortesiaTrigger =
  /** Tornar a unidade gratuita (planValue 0). */
  | "free"
  /** Criar ou estender período promocional. */
  | "promo"
  /** Empurrar o vencimento para além do teto. */
  | "postpone"
  /** Reduzir o valor de uma cobrança já emitida. */
  | "discount"
  /** Devolver a unidade ao ar (status ACTIVE ou PENDING). */
  | "reactivate"

const TRIGGER_LABEL: Record<CortesiaTrigger, string> = {
  free: "tornar a unidade gratuita",
  promo: "conceder período promocional",
  postpone: "adiar o vencimento",
  discount: "reduzir o valor da cobrança",
  reactivate: "reativar a unidade",
}

/**
 * Reativar é o ÚNICO gatilho que exige a unidade já estar fora do ar; os demais
 * valem em QUALQUER status enquanto ela nunca tiver pago.
 *
 * A distinção não é cosmética — foi o furo que sobrou da primeira versão. A
 * criação fixa a 1ª cobrança em D+3, então os vencimentos esticados que
 * motivaram a regra (`valedosaber` D+20, `andersoncidade` D+15,
 * `concluirconsultoriaeducacional` D+11) só podem ter sido gravados enquanto a
 * unidade ainda era `PENDING` — ela só vira `SUSPENDED` DEPOIS de vencer. Com o
 * gate exigindo SUSPENDED/CANCELLED, o caminho que de fato produziu o problema
 * continuava aberto.
 */
const REQUIRES_INACTIVE: Record<CortesiaTrigger, boolean> = {
  free: false,
  promo: false,
  postpone: false,
  discount: false,
  reactivate: true,
}

export interface TenantLifecycle {
  id: string
  slug: string
  status: TenantStatus
  accountManagerId: string | null
  salesUserId: string | null
  /** Nascimento da unidade — âncora IMUTÁVEL do teto de vencimento. */
  createdAt: Date
  /** Já teve ao menos uma mensalidade paga. */
  everPaid: boolean
  /**
   * Está fora do ar E nunca pagou. É o balde "Nunca ativou" do relatório e o
   * gatilho da REATIVAÇÃO — não dos demais, que valem em qualquer status
   * (ver `REQUIRES_INACTIVE`).
   */
  neverActivated: boolean
}

/**
 * Carrega o ciclo de vida da unidade em UM round-trip. Devolve os campos de
 * carteira junto porque toda rota que chama isto também precisa de
 * `ctx.canAccessTenant`.
 */
export async function loadTenantLifecycle(
  tenantId: string,
): Promise<TenantLifecycle | null> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      status: true,
      accountManagerId: true,
      salesUserId: true,
      createdAt: true,
      // `take: 1` — só interessa se existe alguma, não quantas.
      tenantPayments: {
        where: EVER_PAID_PAYMENT_WHERE,
        take: 1,
        select: { id: true },
      },
    },
  })
  if (!row) return null

  const everPaid = row.tenantPayments.length > 0
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    accountManagerId: row.accountManagerId,
    salesUserId: row.salesUserId,
    createdAt: row.createdAt,
    everPaid,
    neverActivated:
      !everPaid && (INACTIVE_STATUSES as readonly string[]).includes(row.status),
  }
}

/** Normaliza para meia-noite UTC do dia civil, aceitando `YYYY-MM-DD` ou Date. */
function toUtcDay(value: string | Date): Date {
  return typeof value === "string"
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
      )
}

/**
 * `true` se o vencimento pedido está além do prazo tolerado para a unidade.
 *
 * A ÂNCORA É `createdAt`, NÃO "hoje" — e isso é o ponto. Ancorado em hoje, o
 * teto vira uma janela deslizante: adiar para hoje+10, no dia seguinte adiar de
 * novo para hoje+10 (que já é D+11 do original), e em um mês o vencimento está
 * 40 dias à frente sem nenhuma linha de auditoria, porque nenhuma das chamadas
 * chegou a ser bloqueada. `createdAt` é imutável, então o limite é absoluto e
 * repetir a operação não compra prazo nenhum.
 *
 * Consequência deliberada: numa unidade antiga que nunca pagou, `createdAt + 10`
 * já passou, então QUALQUER vencimento futuro conta como esticado e cai no gate.
 * É o comportamento certo — dar prazo novo a quem nunca pagou é exatamente a
 * cortesia que o dono quis controlar.
 *
 * Compara em DIA CIVIL BRASILEIRO (`brDayStartUtc`): o servidor roda em UTC e o
 * vencimento é uma data civil do Brasil; sem isso o corte erra por um dia entre
 * 21h e meia-noite.
 */
export function isDueDateStretched(
  dueDate: string | Date,
  tenantCreatedAt: Date,
): boolean {
  const due = toUtcDay(dueDate)
  if (Number.isNaN(due.getTime())) return false

  const limit = brDayStartUtc(tenantCreatedAt)
  limit.setUTCDate(limit.getUTCDate() + MAX_DUE_DAYS_AHEAD)
  return due.getTime() > limit.getTime()
}

/** Piso da justificativa. Espelhado no zod de cada rota. */
export const MIN_REASON_LENGTH = 10
export const MAX_REASON_LENGTH = 500

export type CortesiaVerdict =
  | { blocked: true; message: string; requiresReason: boolean }
  | { blocked: false; overridden: boolean; reason?: string }

/**
 * O gate. PURO — não lê o banco e não monta resposta HTTP; a rota resolve
 * `override` a partir de `ctx.can("unidades.cortesiaExcepcional")` + o `reason`
 * do body, e traduz o veredito em 403.
 *
 * `requiresReason: true` diz ao cliente que a pessoa TEM o poder, só falta a
 * justificativa — é o que dispara o diálogo de confirmação em vez de um erro
 * seco.
 */
export function assertCortesiaExcepcional(input: {
  tenant: Pick<TenantLifecycle, "everPaid" | "neverActivated">
  trigger: CortesiaTrigger
  override: { allowed: boolean; reason?: string | null }
}): CortesiaVerdict {
  // Quem já pagou nunca entra no gate, qualquer que seja o gatilho.
  if (input.tenant.everPaid) return { blocked: false, overridden: false }
  // Reativar exige que ela esteja fora do ar; os demais valem em qualquer
  // status enquanto ela nunca tiver pago — inclusive `PENDING`, que é onde os
  // prazos esticados eram gravados.
  if (REQUIRES_INACTIVE[input.trigger] && !input.tenant.neverActivated) {
    return { blocked: false, overridden: false }
  }

  const base = input.tenant.neverActivated
    ? "Esta unidade nunca pagou nenhuma mensalidade e está suspensa ou cancelada."
    : "Esta unidade nunca pagou nenhuma mensalidade."

  if (!input.override.allowed) {
    return {
      blocked: true,
      requiresReason: false,
      message: `${base} ${TRIGGER_LABEL[input.trigger].replace(/^./, (c) => c.toUpperCase())} exige liberação do super admin.`,
    }
  }

  const reason = input.override.reason?.trim()
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    return {
      blocked: true,
      requiresReason: true,
      message: `${base} Para ${TRIGGER_LABEL[input.trigger]} assim mesmo, descreva o motivo (mínimo ${MIN_REASON_LENGTH} caracteres) — ele fica registrado na auditoria.`,
    }
  }

  return { blocked: false, overridden: true, reason }
}

/** Unidade travada que pertence ao titular sendo cadastrado. */
export interface BlockedUnitForPerson {
  id: string
  slug: string
  name: string
  status: TenantStatus
}

/** Só os dígitos — `User.cpf` é gravado assim. */
function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

/**
 * Unidades travadas (fora do ar e que nunca pagaram) pertencentes à MESMA
 * pessoa que está sendo cadastrada como titular.
 *
 * POR QUE EXISTE: a trava de cortesia é por TENANT. Sem isto, cancelar a
 * unidade que nunca pagou e abrir outra em cortesia para o mesmo dono
 * contornava a regra inteira — o titular é a pessoa, não a linha do banco.
 *
 * TRÊS IDENTIFICADORES, casados EM MEMÓRIA sobre o conjunto travado (um titular
 * por unidade, hoje ~20 linhas). Não dá para fazer o `where` no banco pelos três
 * de uma vez: `User.phone` NÃO tem unicidade e foi gravado como a pessoa
 * digitou — "(31) 99999-8888" e "+5531999998888" são a mesma pessoa e nenhum
 * `equals`/`contains` os aproxima. Normalizar em memória é o mesmo caminho que a
 * API de parceiros já usa (`lib/api-parceiros/lookup.ts`).
 *
 * O custo é limitado pelo TAMANHO DA BLACKLIST, que o negócio quer pequeno. Se
 * um dia crescer para milhares, troque por prefiltro em `cpf`/`email` (ambos
 * únicos e indexados) mantendo o telefone em memória.
 */
export async function findBlockedUnitsForPerson(person: {
  cpfCnpj?: string | null
  email?: string | null
  phone?: string | null
}): Promise<BlockedUnitForPerson[]> {
  const cpf = digits(person.cpfCnpj)
  const email = person.email?.trim().toLowerCase() ?? ""
  const phone = person.phone ? normalizePhone(person.phone) : ""
  if (!cpf && !email && !phone) return []

  const candidatos = await prisma.tenant.findMany({
    where: { ...NEVER_ACTIVATED_WHERE, slug: { not: PMB_TENANT_SLUG } },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      owner: { select: { cpf: true, email: true, phone: true } },
    },
  })

  return candidatos
    .filter((t) => {
      const dono = t.owner
      if (!dono) return false
      // CPF e e-mail são únicos no banco; telefone não é, por isso normaliza.
      if (cpf && digits(dono.cpf) === cpf) return true
      if (email && dono.email.trim().toLowerCase() === email) return true
      if (phone && dono.phone && normalizePhone(dono.phone) === phone) return true
      return false
    })
    .map(({ id, slug, name, status }) => ({ id, slug, name, status }))
}

/**
 * Gate da CRIAÇÃO: nasce de graça (ou em promoção) para quem já tem unidade
 * travada?
 *
 * Separado de `assertCortesiaExcepcional` porque o motivo do bloqueio é outro —
 * lá é "ESTA unidade nunca pagou", aqui é "ESTE TITULAR já tem unidade que nunca
 * pagou" — e a mensagem precisa nomear quais, senão quem cadastra não entende o
 * 403. Mesma forma de veredito, para o diálogo de justificativa funcionar igual.
 */
export function assertCortesiaNaCriacao(input: {
  blockedUnits: BlockedUnitForPerson[]
  trigger: CortesiaTrigger
  override: { allowed: boolean; reason?: string | null }
}): CortesiaVerdict {
  if (input.blockedUnits.length === 0) {
    return { blocked: false, overridden: false }
  }

  const lista = input.blockedUnits
    .map((u) => `${u.name} (${u.slug}, ${u.status === "CANCELLED" ? "cancelada" : "suspensa"})`)
    .join("; ")
  const base =
    input.blockedUnits.length === 1
      ? `Este titular já tem uma unidade que nunca pagou nenhuma mensalidade: ${lista}.`
      : `Este titular já tem ${input.blockedUnits.length} unidades que nunca pagaram nenhuma mensalidade: ${lista}.`

  if (!input.override.allowed) {
    return {
      blocked: true,
      requiresReason: false,
      message: `${base} Criar outra em cortesia ou promoção exige liberação do super admin — a preço cheio, pode cadastrar normalmente.`,
    }
  }

  const reason = input.override.reason?.trim()
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    return {
      blocked: true,
      requiresReason: true,
      message: `${base} Para ${TRIGGER_LABEL[input.trigger]} assim mesmo, descreva o motivo (mínimo ${MIN_REASON_LENGTH} caracteres) — ele fica registrado na auditoria.`,
    }
  }

  return { blocked: false, overridden: true, reason }
}

/** Ações de auditoria da cortesia excepcional. */
export const CORTESIA_AUDIT = {
  /** Super admin liberou, com motivo. */
  granted: "tenant.cortesia_excepcional.granted",
  /** Tentativa negada — registrada para o dono ver quem insiste. */
  blocked: "tenant.cortesia_excepcional.blocked",
  /** Baixa manual de cobrança que tirou a unidade da blacklist sem gateway. */
  laundered: "tenant.cortesia_excepcional.laundered",
} as const
