import { prisma } from "@/lib/prisma"
import { TenantStatus } from "@prisma/client"

// Placar publico de lancamento. Tudo aqui e AGREGADO — nunca expomos dados
// individuais sensiveis (Asaas ids, tokens, valores em R$). O nome da revenda
// e publico (ja aparece na vitrine slug.livrecursos.com.br), por isso o ticker
// de "ultimas ativadas" pode mostra-lo.

// Tenant placeholder da vitrine PMB (vendas diretas) — nunca conta como revenda.
const PMB_SLUG = "__pmb__"

// Revendas que CONTAM para o placar: exclui a unidade PMB (propria) e revendas
// gratuitas/cortesia. "Gratuita" == planValue 0 — nasce ACTIVE sem cobranca no
// Asaas (e uma revenda paga convertida em gratis tambem fica com planValue 0),
// entao `gt: 0` cobre os dois casos. Ver src/app/api/admin/revendedores.
const COUNTABLE = { slug: { not: PMB_SLUG }, planValue: { gt: 0 } } as const

// Meta de revendas ATIVAS do lancamento. Configuravel via env sem deploy.
export const PLACAR_META = Number(process.env.PLACAR_META ?? 100)

export interface PlacarSnapshot {
  meta: number
  /** Revendas ATIVAS — o numero do meio do placar e a meta. */
  ativos: number
  /** 0-100, ja limitado ao teto para a barra de progresso. */
  progresso: number
  funnel: {
    aguardando: number // PENDING — aguardando 1o pagamento
    ativos: number // ACTIVE — pagas/ativas
    suspensos: number // SUSPENDED — inadimplentes
    cancelados: number // CANCELLED
  }
  /** Revendas que tiveram pagamento confirmado HOJE (fuso BR). */
  novasHoje: number
  /** Ultimas revendas ativadas (nome publico), mais recente primeiro. */
  recentes: { name: string }[]
  generatedAt: string
}

// Inicio do dia atual no fuso de Sao Paulo (UTC-3), em instante UTC.
// Meia-noite BRT == 03:00 UTC do mesmo dia.
function startOfTodayBR(): Date {
  const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return new Date(
    Date.UTC(
      nowBR.getUTCFullYear(),
      nowBR.getUTCMonth(),
      nowBR.getUTCDate(),
      3,
      0,
      0,
      0
    )
  )
}

/**
 * IDs + nomes das revendas ATIVAS. Usado pelo stream SSE para detectar
 * novas ativacoes (uma revenda que aparece aqui e nao estava no tick anterior
 * = venda nova → dispara o som de caixa registradora).
 */
export async function getActiveTenants(): Promise<
  { id: string; name: string }[]
> {
  return prisma.tenant.findMany({
    where: { ...COUNTABLE, status: TenantStatus.ACTIVE },
    select: { id: true, name: true },
  })
}

export async function getPlacarSnapshot(): Promise<PlacarSnapshot> {
  const start = startOfTodayBR()

  const [grouped, paidToday, recentes] = await Promise.all([
    prisma.tenant.groupBy({
      by: ["status"],
      where: COUNTABLE,
      _count: { _all: true },
    }),
    // Revendas com pagamento efetivamente recebido hoje (vendas do dia).
    prisma.tenantPayment.findMany({
      where: {
        status: { in: ["RECEIVED", "CONFIRMED"] },
        paidAt: { gte: start },
      },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
    prisma.tenant.findMany({
      where: { ...COUNTABLE, status: TenantStatus.ACTIVE },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ])

  const countOf = (s: TenantStatus) =>
    grouped.find((g) => g.status === s)?._count._all ?? 0

  const funnel = {
    aguardando: countOf(TenantStatus.PENDING),
    ativos: countOf(TenantStatus.ACTIVE),
    suspensos: countOf(TenantStatus.SUSPENDED),
    cancelados: countOf(TenantStatus.CANCELLED),
  }

  const ativos = funnel.ativos
  const progresso =
    PLACAR_META > 0 ? Math.min(100, Math.round((ativos / PLACAR_META) * 100)) : 0

  return {
    meta: PLACAR_META,
    ativos,
    progresso,
    funnel,
    novasHoje: paidToday.length,
    recentes: recentes.map((r) => ({ name: r.name })),
    generatedAt: new Date().toISOString(),
  }
}

// ── Placar de INDICAÇÕES (revendedor de revenda) ───────────────────────────
// Mesmo motor do placar de lançamento, porém escopado às revendas que ESTE
// revendedor indicou (Tenant.referrerTenantId = id dele). Sempre passe o
// tenantId da SESSÃO — o isolamento entre revendedores depende disso. A "meta"
// aqui é o total de revendas indicadas (denominador "ativas / indicadas").

/**
 * IDs + nomes das revendas indicadas por `referrerTenantId` que estão ATIVAS.
 * Usado pelo stream SSE do painel para detectar novas ativações (som).
 */
export async function getReferralActiveTenants(
  referrerTenantId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.tenant.findMany({
    where: { ...COUNTABLE, referrerTenantId, status: TenantStatus.ACTIVE },
    select: { id: true, name: true },
  })
}

export async function getReferralPlacarSnapshot(
  referrerTenantId: string,
): Promise<PlacarSnapshot> {
  const start = startOfTodayBR()
  const where = { ...COUNTABLE, referrerTenantId }

  const [grouped, paidToday, recentes] = await Promise.all([
    prisma.tenant.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    // Indicadas com pagamento recebido hoje (ativações/recebimentos do dia).
    prisma.tenantPayment.findMany({
      where: {
        status: { in: ["RECEIVED", "CONFIRMED"] },
        paidAt: { gte: start },
        tenant: { referrerTenantId },
      },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
    prisma.tenant.findMany({
      where: { ...where, status: TenantStatus.ACTIVE },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ])

  const countOf = (s: TenantStatus) =>
    grouped.find((g) => g.status === s)?._count._all ?? 0

  const funnel = {
    aguardando: countOf(TenantStatus.PENDING),
    ativos: countOf(TenantStatus.ACTIVE),
    suspensos: countOf(TenantStatus.SUSPENDED),
    cancelados: countOf(TenantStatus.CANCELLED),
  }

  // Meta = total de indicadas (denominador). Sem indicadas ainda → 0/0 = 0%.
  const total =
    funnel.aguardando + funnel.ativos + funnel.suspensos + funnel.cancelados
  const ativos = funnel.ativos
  const progresso = total > 0 ? Math.round((ativos / total) * 100) : 0

  return {
    meta: total,
    ativos,
    progresso,
    funnel,
    novasHoje: paidToday.length,
    recentes: recentes.map((r) => ({ name: r.name })),
    generatedAt: new Date().toISOString(),
  }
}
