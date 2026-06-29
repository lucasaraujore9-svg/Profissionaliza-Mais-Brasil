import { env } from "@/lib/env"

export const DEFAULT_LMS_PUBLIC_URL = "https://lms.bmbr.com.br"

const LOCAL_LMS_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "localhost", "::1"])

function configuredLmsUrl(): string {
  const configured = env.LMS_API_URL?.trim()
  if (!configured) return DEFAULT_LMS_PUBLIC_URL

  try {
    const parsed = new URL(configured)
    if (LOCAL_LMS_HOSTS.has(parsed.hostname)) return DEFAULT_LMS_PUBLIC_URL
    return configured
  } catch {
    return DEFAULT_LMS_PUBLIC_URL
  }
}

export function lmsPublicBaseUrl(): string {
  return configuredLmsUrl().replace(/\/$/, "")
}

/**
 * URLs vindas do LMS podem carregar o host interno do serviço quando o ambiente
 * dele está mal configurado. Para o aluno, o domínio público sempre deve ser o
 * da plataforma real, preservando path/query/hash do link emitido.
 */
export function normalizeLmsPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null

  const trimmed = url.trim()
  if (!trimmed) return null

  const publicBase = new URL(lmsPublicBaseUrl())

  try {
    const parsed = new URL(trimmed)
    if (LOCAL_LMS_HOSTS.has(parsed.hostname)) {
      parsed.protocol = publicBase.protocol
      parsed.hostname = publicBase.hostname
      parsed.port = publicBase.port
    }
    return parsed.toString()
  } catch {
    if (trimmed.startsWith("/")) {
      return new URL(trimmed, publicBase).toString()
    }
    return trimmed
  }
}
