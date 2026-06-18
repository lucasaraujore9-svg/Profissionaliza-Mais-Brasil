// Helpers de YouTube para os treinamentos. Guardamos apenas o ID de 11 chars
// no banco (TrainingVideo.youtubeId) e derivamos URLs de embed/thumb a partir
// dele — assim qualquer formato de URL colado pelo admin é normalizado.

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

/**
 * Extrai o ID de 11 caracteres de uma URL do YouTube (ou aceita o ID puro).
 * Suporta: youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>,
 * /live/<id> e variações com parâmetros extras. Retorna null se inválido.
 */
export function extractYoutubeId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Já é um ID puro.
  if (YOUTUBE_ID_RE.test(raw)) return raw

  let url: URL
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "")

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0]
    return id && YOUTUBE_ID_RE.test(id) ? id : null
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    // watch?v=<id>
    const v = url.searchParams.get("v")
    if (v && YOUTUBE_ID_RE.test(v)) return v

    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments.length >= 2 && ["embed", "shorts", "live", "v"].includes(segments[0])) {
      const id = segments[1]
      return id && YOUTUBE_ID_RE.test(id) ? id : null
    }
  }

  return null
}

/** URL de embed (privacy-enhanced) para o iframe do player. */
export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`
}

/** Thumbnail de capa do vídeo (hqdefault sempre existe). */
export function youtubeThumbUrl(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
}

/** Link "assistir no YouTube". */
export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`
}
