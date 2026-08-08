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

/** Uma cobrança que representa dinheiro recebido — pelo Asaas ou na mão. */
export const EVER_PAID_PAYMENT_WHERE: Prisma.TenantPaymentWhereInput = {
  OR: [
    { status: { in: [...EVER_PAID_STATUSES] } },
    // Baixa manual do financeiro da PMB (PIX/espécie fora do Asaas).
    { markedPaidAt: { not: null } },
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
  /** Empurrar o vencimento para além de D+10. */
  | "postpone"
  /** Devolver a unidade ao ar (status ACTIVE ou PENDING). */
  | "reactivate"

const TRIGGER_LABEL: Record<CortesiaTrigger, string> = {
  free: "tornar a unidade gratuita",
  promo: "conceder período promocional",
  postpone: "adiar o vencimento",
  reactivate: "reativar a unidade",
}

export interface TenantLifecycle {
  id: string
  slug: string
  status: TenantStatus
  accountManagerId: string | null
  salesUserId: string | null
  /** Já teve ao menos uma mensalidade paga. */
  everPaid: boolean
  /** Está fora do ar e nunca pagou — sujeita à cortesia excepcional. */
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
    everPaid,
    neverActivated:
      !everPaid && (INACTIVE_STATUSES as readonly string[]).includes(row.status),
  }
}

/**
 * `true` se o vencimento pedido está além do prazo tolerado.
 *
 * Compara em DIA CIVIL BRASILEIRO. O servidor roda em UTC e o vencimento é uma
 * data civil do Brasil — sem `brDayStartUtc`, uma data digitada como "hoje" no
 * Brasil pode ler como amanhã no servidor e o corte erra por um dia.
 */
export function isDueDateStretched(
  dueDate: string | Date,
  now: Date = new Date(),
): boolean {
  const due =
    typeof dueDate === "string"
      ? new Date(`${dueDate}T00:00:00.000Z`)
      : new Date(
          Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth(),
            dueDate.getUTCDate(),
          ),
        )
  if (Number.isNaN(due.getTime())) return false

  const limit = brDayStartUtc(now)
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
  tenant: Pick<TenantLifecycle, "neverActivated">
  trigger: CortesiaTrigger
  override: { allowed: boolean; reason?: string | null }
}): CortesiaVerdict {
  if (!input.tenant.neverActivated) return { blocked: false, overridden: false }

  const base =
    "Esta unidade nunca pagou nenhuma mensalidade e está suspensa ou cancelada."

  if (!input.override.allowed) {
    return {
      blocked: true,
      requiresReason: false,
      message: `${base} Cortesia, promoção e adiamento de vencimento exigem liberação do super admin.`,
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
