import type { ImageLoaderProps } from "next/image"
import { isProxyableImageUrl } from "./images"

// Loader customizado do next/image (images.loaderFile no next.config.ts).
// Roteia imagens remotas conhecidas pelo proxy /api/img, que devolve WebP
// redimensionado e cacheado no CDN. Qualquer coisa fora da allowlist (assets
// locais, data:/blob:, SVG/GIF, hosts desconhecidos) passa direto — mesmo
// comportamento do `unoptimized`, que é o fallback seguro.
export default function pmbImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!isProxyableImageUrl(src)) return src
  const q = quality ?? 70
  return `/api/img?url=${encodeURIComponent(src)}&w=${width}&q=${q}`
}
