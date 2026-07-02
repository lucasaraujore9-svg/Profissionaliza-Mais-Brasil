const VERCEL_API = "https://api.vercel.com"

export class VercelNotConfiguredError extends Error {
  constructor() {
    super(
      "Recurso de domínio personalizado indisponível no momento. Use o subdomínio oficial ou entre em contato com o suporte.",
    )
    this.name = "VercelNotConfiguredError"
  }
}

export function isVercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)
}

function getConfig(): {
  token: string
  projectId: string
  teamId?: string
} {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) throw new VercelNotConfiguredError()
  return {
    token,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
  }
}

function appendTeamId(url: string, teamId?: string): string {
  if (!teamId) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}teamId=${teamId}`
}

async function vercelFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const { token, teamId } = getConfig()
  const url = appendTeamId(`${VERCEL_API}${path}`, teamId)
  // Timeout 15s — sem retry. Vercel API costuma responder rápido; falha
  // = mostra erro pro user que tenta de novo manualmente (verify domínio,
  // etc.). Não pode pendurar a rota se Vercel API estiver lenta.
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Vercel API ${res.status}`
    throw new Error(message)
  }
  return body as T
}

export interface VercelDomain {
  name: string
  apexName: string
  verified: boolean
  verification?: Array<{
    type: string
    domain: string
    value: string
    reason: string
  }>
}

export async function addProjectDomain(domain: string): Promise<VercelDomain> {
  const { projectId } = getConfig()
  return vercelFetch<VercelDomain>(
    `/v10/projects/${projectId}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
  )
}

export async function removeProjectDomain(domain: string): Promise<void> {
  const { projectId } = getConfig()
  await vercelFetch<unknown>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" },
  )
}

export interface VercelDomainStatus {
  name: string
  verified: boolean
  verification?: Array<{
    type: string
    domain: string
    value: string
    reason: string
  }>
}

export async function getProjectDomain(
  domain: string,
): Promise<VercelDomainStatus> {
  const { projectId } = getConfig()
  return vercelFetch<VercelDomainStatus>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: "GET" },
  )
}

export async function verifyProjectDomain(
  domain: string,
): Promise<VercelDomainStatus> {
  const { projectId } = getConfig()
  return vercelFetch<VercelDomainStatus>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`,
    { method: "POST" },
  )
}

export interface VercelDomainConfig {
  // `misconfigured: false` significa que os registros DNS do dominio ja apontam
  // corretamente para a Vercel (A no apex / CNAME no www). E o sinal fiel de
  // "registro apontado" que usamos para aplicar o dominio proprio — separado do
  // `verified` (posse), que pode estar true antes do DNS resolver.
  misconfigured: boolean
  // Quem configurou o dominio ("dns-01" / "http" / null). So informativo.
  configuredBy?: string | null
}

// Estado de configuracao DNS do dominio (nivel conta/time, nao projeto).
// GET /v6/domains/{domain}/config → { misconfigured, ... }
export async function getDomainConfig(
  domain: string,
): Promise<VercelDomainConfig> {
  // Endpoint de conta/time (nao usa projectId), mas exige token valido.
  getConfig()
  return vercelFetch<VercelDomainConfig>(
    `/v6/domains/${encodeURIComponent(domain)}/config`,
    { method: "GET" },
  )
}
