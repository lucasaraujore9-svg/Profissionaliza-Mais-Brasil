import { prisma } from "@/lib/prisma"
import { listarCursos } from "@/lib/escola-avancada/client"
import { parseBRPrice, slugify } from "@/lib/utils"
import { pushSyncLog, type SyncLogEntry } from "./sync-log"

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

      const data = {
        nome: curso.nome,
        slug,
        descricao: curso.obs || null,
        qtdAulas,
        cargaHoraria: curso.carga_horaria || null,
        precoOriginal: precoOriginal && precoOriginal > 0 ? precoOriginal : null,
        precoPromocional: precoPromo && precoPromo > 0 ? precoPromo : null,
        parcelasSugeridas: parcelas,
        categoriaInterna: curso.categoria_interna || null,
        categoriaLoja: curso.categoria_loja || null,
        destaque: curso.destaque === "1" || curso.destaque === "true",
        status: curso.status || "ATIVO",
        precoMostrar: curso.preco_mostrar === "1" || curso.preco_mostrar === "true",
        capaImageUrl: curso.capa_image || null,
        syncedAt: new Date(),
      }

      const existing = await prisma.course.findUnique({
        where: { nome: curso.nome },
        select: { id: true },
      })

      if (existing) {
        await prisma.course.update({
          where: { nome: curso.nome },
          data,
        })
        updated += 1
      } else {
        await prisma.course.create({
          data: { ...data, slug: await ensureUniqueSlug(slug) },
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
