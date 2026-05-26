import { prisma } from "@/lib/prisma"
import type { CurrentTenant } from "@/lib/tenant/current"

export interface TecnicaConfig {
  enabled: boolean
  url: string | null
  label: string
}

const DEFAULT_LABEL = "Cursos Técnicos"

// Considera enabled apenas quando o flag estiver ligado E a URL estiver
// preenchida — sem URL nao tem pra onde redirecionar.
function buildConfig(
  enabled: boolean,
  url: string | null,
  label: string | null,
): TecnicaConfig {
  const trimmedUrl = url?.trim() ?? ""
  const safe = enabled && trimmedUrl.length > 0
  return {
    enabled: safe,
    url: safe ? trimmedUrl : null,
    label: label?.trim() || DEFAULT_LABEL,
  }
}

export function tecnicaFromTenant(
  tenant: Pick<CurrentTenant, "tecnicaEnabled" | "tecnicaUrl" | "tecnicaLabel"> | null,
): TecnicaConfig {
  if (!tenant) return { enabled: false, url: null, label: DEFAULT_LABEL }
  return buildConfig(tenant.tecnicaEnabled, tenant.tecnicaUrl, tenant.tecnicaLabel)
}

export async function loadPmbTecnicaConfig(): Promise<TecnicaConfig> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
      },
    })
    if (!settings) return { enabled: false, url: null, label: DEFAULT_LABEL }
    return buildConfig(
      settings.tecnicaEnabled,
      settings.tecnicaUrl,
      settings.tecnicaLabel,
    )
  } catch {
    return { enabled: false, url: null, label: DEFAULT_LABEL }
  }
}
