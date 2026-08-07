import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"

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
 * Leitura leve do flag de automacao da vitrine PMB, sem o upsert de
 * getPmbAutomationContext (pesado demais para gates de alto volume, como o
 * tracking de page view ou o layout). Default = true, coerente com o default
 * do schema (pmb_automation_enabled).
 */
export async function isPmbAutomationEnabled(): Promise<boolean> {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { pmbAutomationEnabled: true },
  })
  return settings?.pmbAutomationEnabled ?? true
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

/**
 * Gate de entitlement do módulo Automação (plano PRO) no SERVIDOR (SAAS-003).
 *
 * Leitura leve de `Tenant.automationEnabled` — espelha o guard de
 * `whatsapp/connect`/`pair`/`status`, mas reutilizável nas rotas que escrevem
 * config/templates. A UI já esconde o módulo, mas a API não pode confiar só no
 * client: um RESELLER do plano básico não deve persistir config/templates de
 * uma feature que não contratou. Retorna `true` se o tenant tem o módulo.
 */
export async function isTenantAutomationEnabled(
  tenantId: string,
): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { automationEnabled: true },
  })
  return tenant?.automationEnabled ?? false
}

/**
 * Grava de volta o estado REAL da sessao observado no engine.
 *
 * Ate aqui o snapshot `waStatus` so era atualizado quando alguem abria a tela
 * de conexao — entao ele mentia por dias, e o painel mostrava "conectado" para
 * uma sessao morta (ou o contrario). Toda vez que o disparo consulta o engine
 * aproveitamos para corrigir o snapshot, de graca.
 *
 * Best-effort: nunca lanca. O telefone so entra quando vem preenchido, e uma
 * colisao de numero (P2002 — mesmo WhatsApp ligado em outra unidade) degrada
 * para gravar apenas o status.
 */
export async function syncWaSnapshot(
  tenantId: string | null,
  status: string,
  connectedPhone: string | null,
): Promise<void> {
  try {
    if (tenantId === null) {
      await prisma.systemSettings.update({
        where: { id: "default" },
        data: {
          pmbWaStatus: status,
          ...(connectedPhone ? { pmbWaConnectedPhone: connectedPhone } : {}),
          pmbWaStatusUpdatedAt: new Date(),
        },
      })
      return
    }

    try {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          waStatus: status,
          ...(connectedPhone ? { waConnectedPhone: connectedPhone } : {}),
          waStatusUpdatedAt: new Date(),
        },
      })
    } catch {
      // Colisao de telefone (ou qualquer erro na escrita do numero): grava so
      // o status, que e o que o gate de disparo consulta.
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { waStatus: status, waStatusUpdatedAt: new Date() },
      })
    }
  } catch (err) {
    contextLogger().warn(
      { err, event: "automation.wa_snapshot_sync_failed", tenantId },
      "Falha ao sincronizar snapshot da sessao WhatsApp",
    )
  }
}

function vitrineHostBase(): string {
  return process.env.NEXT_PUBLIC_VITRINE_DOMAIN ?? "livrecursos.com.br"
}

function appHostBase(): string {
  return process.env.NEXT_PUBLIC_APP_DOMAIN ?? "profissionalizamaisbrasil.com.br"
}
