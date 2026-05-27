import { prisma } from "@/lib/prisma"

/**
 * Contexto unificado do modulo Automacao. Abstrai a diferenca entre
 * "modulo de um revendedor" (tenantId != null) e "modulo do sistema mae PMB"
 * (tenantId === null, dados em SystemSettings).
 *
 * As funcoes em dispatch.ts e leads.ts usam este helper para evitar
 * ramificacao tenant-vs-pmb em cada lugar.
 */

export interface AutomationContext {
  // null = vitrine PMB
  tenantId: string | null
  enabled: boolean
  waSessionName: string | null
  waConnectedPhone: string | null
  waStatus: string
  abandonedAfterHours: number
  // Nome amigavel exibido em mensagens ({{escola}})
  displayName: string
  // Hostname pra montar links {{link_curso}} sem revelar internals
  publicHost: string
}

export async function getTenantAutomationContext(
  tenantId: string,
): Promise<AutomationContext | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      automationEnabled: true,
      waSessionName: true,
      waConnectedPhone: true,
      waStatus: true,
      abandonedAfterHours: true,
    },
  })

  if (!tenant) return null

  return {
    tenantId: tenant.id,
    enabled: tenant.automationEnabled,
    waSessionName: tenant.waSessionName,
    waConnectedPhone: tenant.waConnectedPhone,
    waStatus: tenant.waStatus,
    abandonedAfterHours: tenant.abandonedAfterHours,
    displayName: tenant.name,
    publicHost: `${tenant.slug}.${vitrineHostBase()}`,
  }
}

export async function getPmbAutomationContext(): Promise<AutomationContext> {
  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: {
      pmbAutomationEnabled: true,
      pmbWaSessionName: true,
      pmbWaConnectedPhone: true,
      pmbWaStatus: true,
      pmbAbandonedAfterHours: true,
    },
  })

  return {
    tenantId: null,
    enabled: settings.pmbAutomationEnabled,
    waSessionName: settings.pmbWaSessionName,
    waConnectedPhone: settings.pmbWaConnectedPhone,
    waStatus: settings.pmbWaStatus,
    abandonedAfterHours: settings.pmbAbandonedAfterHours,
    displayName: "Profissionaliza Mais Brasil",
    publicHost: appHostBase(),
  }
}

/**
 * Dado o tenantId (null = PMB), retorna o contexto unificado.
 */
export async function resolveAutomationContext(
  tenantId: string | null,
): Promise<AutomationContext | null> {
  if (tenantId === null) return getPmbAutomationContext()
  return getTenantAutomationContext(tenantId)
}

function vitrineHostBase(): string {
  return process.env.NEXT_PUBLIC_VITRINE_DOMAIN ?? "livrecursos.com.br"
}

function appHostBase(): string {
  return process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"
}
