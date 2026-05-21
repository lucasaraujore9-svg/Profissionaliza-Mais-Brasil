import { prisma } from "@/lib/prisma"
import { listarCursos } from "@/lib/escola-avancada/client"
import { parseBRPrice, slugify } from "@/lib/utils"
import { pushSyncLog, type SyncLogEntry } from "./sync-log"

/**
 * O endpoint cursos/listar nao retorna o ID numerico do curso na plataforma.
 * Por convencao, a URL da capa segue o padrao
 *   https://<host>/oficial/metodo/imagemcursos/<id>.<ext>
 * (ou .../<id>.jpeg, .png, ...). Quando o admin sobe outra imagem com nome
 * diferente, retornamos null e mantem o eaCourseId previo (se houver).
 */
export function extractEaCourseIdFromCapa(
  capaUrl: string | null | undefined,
): string | null {
  if (!capaUrl) return null
  const match = capaUrl.match(/\/imagemcursos\/(\d+)\.(?:jpe?g|png|gif|webp)/i)
  return match?.[1] ?? null
}

export interface SyncResult {
  added: number
  updated: number
  totalInEa: number
  durationMs: number
}

export async function syncCatalogFromEA(
  source: "manual" | "cron",
): Promise<SyncResult> {
  const start = Date.now()

  try {
    const cursos = await listarCursos()

    let added = 0
    let updated = 0

    for (const curso of cursos) {
      if (!curso.nome) continue

      const slug = slugify(curso.nome)
      const qtdAulas = Number.parseInt(curso.aulas, 10) || 0
      const precoOriginal = curso.preco ? parseBRPrice(curso.preco) : null
      const precoPromo = curso.preco_promocional
        ? parseBRPrice(curso.preco_promocional)
        : null
      const parcelas = curso.parcelas ? Number.parseInt(curso.parcelas, 10) : null

      const destaqueRaw = (curso.destaque ?? "").toString().toLowerCase().trim()
      const isDestaque =
        destaqueRaw === "destacar" ||
        destaqueRaw === "1" ||
        destaqueRaw === "true" ||
        destaqueRaw === "sim"

      const precoMostrarRaw = (curso.preco_mostrar ?? "")
        .toString()
        .toLowerCase()
        .trim()
      const isPrecoMostrar =
        precoMostrarRaw === "sim" ||
        precoMostrarRaw === "1" ||
        precoMostrarRaw === "true"

      const eaCourseIdFromCapa = extractEaCourseIdFromCapa(curso.capa_image)

      const dataBase = {
        nome: curso.nome,
        descricao: curso.obs || null,
        qtdAulas,
        cargaHoraria: curso.carga_horaria || null,
        precoOriginal: precoOriginal && precoOriginal > 0 ? precoOriginal : null,
        precoPromocional: precoPromo && precoPromo > 0 ? precoPromo : null,
        parcelasSugeridas: parcelas,
        categoriaInterna: curso.categoria_interna || null,
        categoriaLoja: curso.categoria_loja || null,
        destaque: isDestaque,
        status: curso.status || "ATIVO",
        precoMostrar: isPrecoMostrar,
        capaImageUrl: curso.capa_image || null,
        syncedAt: new Date(),
      }

      const existing = await prisma.course.findUnique({
        where: { nome: curso.nome },
        select: { id: true, eaCourseId: true },
      })

      // eaCourseId tem unique constraint. So escreve quando:
      // 1) tem id extraido da capa
      // 2) ainda nao esta usado por outro curso (ou esta usado pelo proprio)
      let canSetEaCourseId = false
      if (eaCourseIdFromCapa) {
        if (existing?.eaCourseId === eaCourseIdFromCapa) {
          canSetEaCourseId = false // ja correto, nao precisa atualizar
        } else {
          const conflict = await prisma.course.findUnique({
            where: { eaCourseId: eaCourseIdFromCapa },
            select: { id: true },
          })
          if (!conflict || conflict.id === existing?.id) {
            canSetEaCourseId = true
          }
        }
      }

      if (existing) {
        await prisma.course.update({
          where: { nome: curso.nome },
          data: {
            ...dataBase,
            ...(canSetEaCourseId
              ? { eaCourseId: eaCourseIdFromCapa }
              : {}),
          },
        })
        updated += 1
      } else {
        await prisma.course.create({
          data: {
            ...dataBase,
            slug: await ensureUniqueSlug(slug),
            ...(canSetEaCourseId
              ? { eaCourseId: eaCourseIdFromCapa }
              : {}),
          },
        })
        added += 1
      }
    }

    const durationMs = Date.now() - start

    const entry: SyncLogEntry = {
      id: `sync_${Date.now()}`,
      at: new Date().toISOString(),
      status: "SUCCESS",
      added,
      updated,
      totalInEa: cursos.length,
      message:
        source === "manual"
          ? "Sincronização manual via admin"
          : "Sincronização automática (cron)",
      source,
      durationMs,
    }
    await pushSyncLog(entry)

    return { added, updated, totalInEa: cursos.length, durationMs }
  } catch (error) {
    const durationMs = Date.now() - start
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await pushSyncLog({
      id: `sync_${Date.now()}`,
      at: new Date().toISOString(),
      status: "FAILURE",
      added: 0,
      updated: 0,
      totalInEa: 0,
      message,
      source,
      durationMs,
    })
    throw error
  }
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base
  let suffix = 1
  while (
    await prisma.course.findUnique({ where: { slug }, select: { id: true } })
  ) {
    slug = `${base}-${suffix++}`
    if (suffix > 50) break
  }
  return slug
}
