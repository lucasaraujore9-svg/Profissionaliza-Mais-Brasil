import { NextResponse } from "next/server"
import {
  fetchVitrineAssetHead,
  headVitrineAsset,
  publicUrlFor,
} from "@/lib/supabase/storage"
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

// Paths validos gerados por /api/admin/artes/upload-url — impede o client de
// registrar objetos fora do prefixo artes/ (ou de outra feature) no banco.
export const ART_PATH_RE = /^artes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-story)?\.(png|jpg|webp)$/

export function artMimeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png"
  if (path.endsWith(".webp")) return "image/webp"
  return "image/jpeg"
}

// Valida um objeto de variante JA GRAVADO no bucket (upload direto do browser
// via signed URL): HEAD para tamanho + range GET do cabecalho para magic bytes
// e dimensoes. Devolve as dimensoes ou a Response de erro pronta.
export async function validateUploadedArtObject(
  path: string,
  kind: ArtVariantKind,
): Promise<
  | { ok: true; width: number; height: number }
  | { ok: false; response: NextResponse }
> {
  const label = kind === "feed" ? "feed" : "stories"
  if (!ART_PATH_RE.test(path)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label}: caminho inválido` },
        { status: 400 },
      ),
    }
  }
  const head = await headVitrineAsset(path)
  if (!head.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label} não encontrado no storage — envie novamente` },
        { status: 400 },
      ),
    }
  }
  if (head.size != null && head.size > ART_MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label} maior que 10MB` },
        { status: 400 },
      ),
    }
  }
  const headerBytes = await fetchVitrineAssetHead(path)
  if (!headerBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Não foi possível ler o arquivo de ${label} no storage` },
        { status: 502 },
      ),
    }
  }
  const mime = artMimeFor(path)
  if (!isValidImageMagic(headerBytes, mime)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Arquivo de ${label}: conteúdo não corresponde ao formato declarado` },
        { status: 400 },
      ),
    }
  }
  const dimCheck = checkArtVariantDimensions(headerBytes, mime, kind)
  if (!dimCheck.ok || !dimCheck.got) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: dimCheck.message ?? "Dimensões inválidas", got: dimCheck.got },
        { status: 400 },
      ),
    }
  }
  return { ok: true, width: dimCheck.got.width, height: dimCheck.got.height }
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
