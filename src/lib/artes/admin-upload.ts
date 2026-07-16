import { NextResponse } from "next/server"
import { publicUrlFor } from "@/lib/supabase/storage"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { checkArtVariantDimensions, type ArtVariantKind } from "@/lib/storage/image-dims"

// Validacao compartilhada dos uploads do banco de artes (create + troca de
// variante). Server-only: usada apenas pelas rotas /api/admin/artes*.

// Artes sao posts/stories em PNG que passam facil de 5MB — teto proprio de
// 10MB (o maxSide de 4096px em checkArtVariantDimensions segura o peso real).
export const ART_MAX_BYTES = 10 * 1024 * 1024

export const ART_ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

export function artExtensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    default:
      return "bin"
  }
}

// Valida um arquivo de variante (feed|story) e devolve buffer + dimensoes, ou
// a Response de erro pronta para retornar.
export async function validateArtFile(
  file: File,
  kind: ArtVariantKind,
): Promise<
  | { ok: true; buffer: ArrayBuffer; width: number; height: number }
  | { ok: false; response: NextResponse }
> {
  const label = kind === "feed" ? "feed" : "stories"
  if (!ART_ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label}: formato não suportado (use PNG, JPG ou WEBP)` },
        { status: 400 },
      ),
    }
  }
  if (file.size > ART_MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label} maior que 10MB` },
        { status: 400 },
      ),
    }
  }
  const buffer = await file.arrayBuffer()
  if (!isValidImageMagic(buffer, file.type)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label}: conteúdo não corresponde ao formato declarado` },
        { status: 400 },
      ),
    }
  }
  const dimCheck = checkArtVariantDimensions(buffer, file.type, kind)
  if (!dimCheck.ok || !dimCheck.got) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: dimCheck.message ?? "Dimensões inválidas", got: dimCheck.got },
        { status: 400 },
      ),
    }
  }
  return { ok: true, buffer, width: dimCheck.got.width, height: dimCheck.got.height }
}

// Projecao padrao de uma arte nas respostas do admin: anexa as URLs publicas.
export function withArtUrls<T extends { filePath: string; storyFilePath: string | null }>(
  art: T,
): T & { publicUrl: string; storyPublicUrl: string | null } {
  return {
    ...art,
    publicUrl: publicUrlFor(art.filePath),
    storyPublicUrl: art.storyFilePath ? publicUrlFor(art.storyFilePath) : null,
  }
}
