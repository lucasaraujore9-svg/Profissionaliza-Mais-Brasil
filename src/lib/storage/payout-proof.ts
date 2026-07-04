import "server-only"

// Comprovantes de pagamento de saque de comissão (PII financeira) — bucket
// PRIVADO `payout-proofs` (DB-001). Upload/leitura sempre via service-role; o
// client nunca recebe a URL pública. A leitura é servida por rotas autenticadas
// e escopadas (admin financeiro + a própria revenda dona do saque).
const BUCKET = "payout-proofs"

function getConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error("SUPABASE_URL não configurado")
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurado")
  return { url: url.replace(/\/$/, ""), serviceRoleKey }
}

function authHeaders(serviceRoleKey: string): HeadersInit {
  return { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }
}

async function extractError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.message === "string") return body.message
    if (typeof body?.error === "string") return body.error
  } catch {
    // ignore
  }
  return `${fallback} (status ${response.status})`
}

/** Upload do comprovante. `path` típico: `comprovantes/{payoutId}/{rand}.{ext}`. */
export async function uploadPayoutProof(
  path: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<{ path: string }> {
  const { url, serviceRoleKey } = getConfig()
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(serviceRoleKey),
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: data,
  })
  if (!response.ok) {
    throw new Error(await extractError(response, "Falha ao enviar comprovante"))
  }
  return { path }
}

/** Baixa o comprovante (server-side, service-role). Retorna bytes + content-type. */
export async function downloadPayoutProof(
  path: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const { url, serviceRoleKey } = getConfig()
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "GET",
    headers: authHeaders(serviceRoleKey),
  })
  if (!response.ok) {
    throw new Error(await extractError(response, "Falha ao baixar comprovante"))
  }
  const contentType = response.headers.get("content-type") ?? "application/octet-stream"
  const ab = await response.arrayBuffer()
  return { buffer: Buffer.from(ab), contentType }
}
