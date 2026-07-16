// Allowlist de origens de imagem que o proxy de redimensionamento (/api/img)
// aceita buscar. Compartilhada entre o loader do next/image (client) e a rota
// do proxy (server) — por isso este módulo não pode importar nada server-only.
//
// Contexto: a otimização de imagem da Vercel está desligada (cota 402 — ver
// next.config.ts). Servir os originais direto derrubava aparelhos Android de
// entrada: dezenas de imagens em resolução cheia estouram a memória da GPU e
// o compositor do Chrome renderiza faixas de ruído (mesma família dos
// "fantasmas" da vitrine mobile). O proxy /api/img devolve variantes WebP
// redimensionadas, cacheadas no CDN — sem depender da cota paga.
const PROXYABLE_HOSTS = new Set([
  "playcurso.com", // capas de curso da fornecedora EA
  "s3.bmbr.com.br", // capas de curso da fornecedora LMS
  "img.youtube.com", // thumbnails dos módulos de Treinamento
  "i.ytimg.com",
])

export function isProxyableImageUrl(url: string | null | undefined): boolean {
  if (!url || !url.startsWith("https://")) return false
  try {
    const { hostname, pathname, username, password } = new URL(url)
    if (username || password) return false
    // SVG/GIF passam direto: redimensionar não ajuda (SVG) ou perderia a
    // animação (GIF) — e nenhum dos dois é o peso que derruba a GPU.
    const lower = pathname.toLowerCase()
    if (lower.endsWith(".svg") || lower.endsWith(".gif")) return false
    return hostname.endsWith(".supabase.co") || PROXYABLE_HOSTS.has(hostname)
  } catch {
    return false
  }
}
