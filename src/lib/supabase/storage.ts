const BUCKET = "vitrine-assets"

function getConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error("SUPABASE_URL não configurado")
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurado")
  }
  return { url: url.replace(/\/$/, ""), serviceRoleKey }
}

function authHeaders(serviceRoleKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  }
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

export interface UploadResult {
  path: string
  publicUrl: string
}

export async function uploadVitrineAsset(
  path: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
): Promise<UploadResult> {
  const { url, serviceRoleKey } = getConfig()
  const uploadUrl = `${url}/storage/v1/object/${BUCKET}/${path}`

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...authHeaders(serviceRoleKey),
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: fileBuffer,
  })

  if (!response.ok) {
    const message = await extractError(response, "Falha ao enviar arquivo")
    throw new Error(message)
  }

  return {
    path,
    publicUrl: publicUrlFor(path),
  }
}

export function publicUrlFor(path: string): string {
  const { url } = getConfig()
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`
}

export async function deleteVitrineAsset(path: string): Promise<void> {
  const { url, serviceRoleKey } = getConfig()
  const deleteUrl = `${url}/storage/v1/object/${BUCKET}/${path}`

  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: authHeaders(serviceRoleKey),
  })

  if (!response.ok && response.status !== 404) {
    const message = await extractError(response, "Falha ao remover arquivo")
    throw new Error(message)
  }
}

export function extractAssetPath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) return null
  return publicUrl.slice(idx + marker.length)
}
