import type { Prisma } from "@prisma/client"
import {
  fulfillScholarshipEnrollment,
  type TenantContext,
} from "@/lib/enrollment/fulfill"
import { markLeadAsWon } from "@/lib/automation/leads"
import { swallow } from "@/lib/errors"

/**
 * Venda de valor zero (cupom de 100%, cupom FIXED >= preço, desconto manual
 * integral).
 *
 * Nenhum gateway aceita cobrança de R$ 0 — MP e Asaas rejeitam abaixo do valor
 * mínimo. Antes deste guard o fluxo criava a matrícula, mandava
 * `transaction_amount: 0` / `value: 0`, tomava erro e deixava o aluno com uma
 * matrícula PENDING (que ainda o travava em DUPLICATE_ENROLLMENT na tentativa
 * seguinte) e o cupom já consumido. O curso nunca era liberado.
 *
 * A regra passa a ser: valor final zerado não vai a gateway — a matrícula é
 * liberada na hora, pelo mesmo caminho da bolsa de estudo.
 *
 * CURSO MENSAL: decisão de negócio (2026-07-21) — cupom de 100% libera o curso
 * INTEIRO (12 meses, sem cobrança futura), e não apenas a primeira mensalidade.
 * O desconto incide sobre o valor da mensalidade, então quem emitir um cupom de
 * 100% para um curso mensal está dando o contrato completo. Se um dia a regra
 * virar "só o 1º mês grátis", o guard precisa passar a rodar DEPOIS do branch
 * MONTHLY em `transparent-process` (MP e Asaas) — hoje ele roda antes.
 */
export function isFreeAmount(
  amount: number | string | Prisma.Decimal,
): boolean {
  return Number(amount) <= 0
}

/** Contexto de fulfillment de uma unidade (revenda). */
export function resellerTenantContext(tenant: {
  id: string
  slug: string
  name: string
  plataformaVendedorId: string | null
}): TenantContext {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    plataformaVendedorId: tenant.plataformaVendedorId,
    isPmbVitrine: false,
  }
}

/** Contexto de fulfillment da vitrine PMB (tenant placeholder `__pmb__`). */
export function pmbTenantContext(pmbTenant: {
  id: string
  slug: string
}): TenantContext {
  return {
    id: pmbTenant.id,
    slug: pmbTenant.slug,
    plataformaVendedorId: null,
    isPmbVitrine: true,
    name: "Profissionaliza Mais Brasil",
  }
}

/**
 * Libera a matrícula de valor zero: provisiona o acesso na plataforma de aulas,
 * marca ACTIVE e notifica — sem cobrança e sem registro de `Payment`.
 *
 * Idempotente (no-op se a matrícula já foi provisionada). O cupom consumido via
 * `tryConsumeCoupon` NÃO deve ser devolvido: o uso foi efetivo.
 */
export async function releaseFreeEnrollment(
  tenant: TenantContext,
  enrollmentId: string,
): Promise<void> {
  await fulfillScholarshipEnrollment(tenant, enrollmentId, {
    reason: "FULL_DISCOUNT",
  })

  // Conversão real, ainda que de valor zero: sem isto o lead do checkout ficaria
  // em CHECKOUT_STARTED e o cron de abandono o marcaria como ABANDONED.
  await markLeadAsWon({
    enrollmentId,
    tenantId: tenant.isPmbVitrine ? null : tenant.id,
    amount: 0,
  }).catch(swallow("checkout.free.lead_won"))
}
