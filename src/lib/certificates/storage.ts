const BUCKET = "certificates"

function getConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error("SUPABASE_URL nao configurado")
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado")
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

/**
 * Upload de PDF de certificado. Path tipico:
 *   {tenantId ?? "pmb"}/{code}.pdf
 */
export async function uploadCertificatePdf(
  path: string,
  data: Buffer | Uint8Array | ArrayBuffer,
): Promise<UploadResult> {
  const { url, serviceRoleKey } = getConfig()
  const uploadUrl = `${url}/storage/v1/object/${BUCKET}/${path}`

  // Normaliza para BlobPart aceito por Blob (compativel com BodyInit do fetch)
  let bodyBuf: ArrayBuffer
  if (data instanceof ArrayBuffer) {
    bodyBuf = data
  } else if (data instanceof Uint8Array) {
    // Buffer eh Uint8Array<ArrayBufferLike>. Copia o slice util para um ArrayBuffer puro.
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    bodyBuf = copy.buffer
  } else {
    const copy = new Uint8Array(data)
    bodyBuf = copy.buffer
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...authHeaders(serviceRoleKey),
      "Content-Type": "application/pdf",
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: bodyBuf,
  })

  if (!response.ok) {
    const message = await extractError(response, "Falha ao enviar certificado")
    throw new Error(message)
  }

  return { path, publicUrl: certificatePublicUrl(path) }
}

export function certificatePublicUrl(path: string): string {
  const { url } = getConfig()
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`
}

/**
 * Gera uma signed URL de curta duração para o PDF do certificado.
 * Pré-requisito para tornar o bucket `certificates` PRIVADO (issue 100/R1):
 * uma vez privado, as rotas autenticadas/validação devem servir o PDF via
 * esta função em vez de `certificatePublicUrl`. Funciona em bucket público
 * também — é seguro migrar o read path antes do toggle do bucket.
 */
export async function createSignedCertificateUrl(
  path: string,
  expiresInSec = 120,
): Promise<string> {
  const { url, serviceRoleKey } = getConfig()
  const signUrl = `${url}/storage/v1/object/sign/${BUCKET}/${path}`
  const response = await fetch(signUrl, {
    method: "POST",
    headers: { ...authHeaders(serviceRoleKey), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSec }),
  })
  if (!response.ok) {
    const message = await extractError(response, "Falha ao assinar URL do certificado")
    throw new Error(message)
  }
  const body = (await response.json()) as { signedURL?: string }
  if (!body.signedURL) throw new Error("Resposta de signed URL sem signedURL")
  // signedURL vem como caminho relativo "/object/sign/...": prefixa o host.
  return `${url}/storage/v1${body.signedURL}`
}

/**
 * Baixa o PDF (server-side). Util quando queremos servir o conteudo
 * direto via /api (sem expor a URL publica).
 */
export async function downloadCertificatePdf(path: string): Promise<Buffer> {
  const { url, serviceRoleKey } = getConfig()
  const fetchUrl = `${url}/storage/v1/object/${BUCKET}/${path}`
  const response = await fetch(fetchUrl, {
    method: "GET",
    headers: authHeaders(serviceRoleKey),
  })
  if (!response.ok) {
    const message = await extractError(response, "Falha ao baixar certificado")
    throw new Error(message)
  }
  const ab = await response.arrayBuffer()
  return Buffer.from(ab)
}

/**
 * Deriva o PATH do objeto no bucket a partir do valor persistido em
 * `Certificate.pdfUrl`. Aceita 3 formas, para compatibilidade total:
 *  - PATH puro `"{tenant}/{certId}.pdf"` — forma ATUAL (o que passamos a gravar:
 *    nunca mais persistimos URL pública com PII no banco — DB-001/LGPD-001);
 *  - URL pública legada `".../object/public/certificates/{path}"` — linhas antigas;
 *  - signed URL `".../object/sign/certificates/{path}?token=..."` — defensivo.
 * URL http(s) de forma desconhecida => null (não dá pra derivar o path com segurança).
 */
export function extractCertificatePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  for (const marker of [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
  ]) {
    const idx = stored.indexOf(marker)
    if (idx >= 0) return stored.slice(idx + marker.length).split("?")[0] || null
  }
  // URL de outra origem/scheme — não inferimos o path.
  if (/^https?:\/\//i.test(stored)) return null
  // Forma atual: path puro relativo ao bucket (remove barras iniciais acidentais).
  return stored.replace(/^\/+/, "") || null
}

export async function deleteCertificatePdf(path: string): Promise<void> {
  const { url, serviceRoleKey } = getConfig()
  const deleteUrl = `${url}/storage/v1/object/${BUCKET}/${path}`
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: authHeaders(serviceRoleKey),
  })
  if (!response.ok && response.status !== 404) {
    const message = await extractError(response, "Falha ao remover certificado")
    throw new Error(message)
  }
}
