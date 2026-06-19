import { prisma } from "@/lib/prisma"
import { listLmsCourses, getLmsCourse } from "@/lib/lms"
import { slugify } from "@/lib/utils"
import { contextLogger } from "@/lib/logger"
import { pushSyncLog, type SyncLogEntry } from "./sync-log"
import { ensureUniqueCourseSlug, type SyncResult } from "./sync"

/**
 * Sincroniza o catalogo da nova fornecedora (LMS lms.bmbr.com.br) para Course.
 *
 * Diferencas em relacao ao syncCatalogFromEA:
 *  - Match por `lmsCourseId` (UUID estavel), nao por nome.
 *  - Cada linha nasce/permanece provider=LMS; o sync NUNCA toca em cursos EA.
 *  - Preco/parcelas/categoria/visibilidade sao curadoria do admin no PMB
 *    (o LMS so entrega conteudo) — no create ficam nulos, no update nao sao
 *    sobrescritos.
 *  - Capa (coverImage) vem do detalhe /courses/:slug (1 call extra por curso;
 *    catalogo e pequeno). Falha ao buscar capa nao aborta o curso.
 */
export async function syncCatalogFromLMS(
  source: "manual" | "cron",
): Promise<SyncResult> {
  const start = Date.now()

  try {
    const cursos = await listLmsCourses()

    let added = 0
    let updated = 0

    for (const curso of cursos) {
      if (!curso.title) continue

      // Capa vem so no detalhe — best-effort.
      let coverImage: string | null = null
      try {
        const detail = await getLmsCourse(curso.slug)
        coverImage = detail.coverImage || null
      } catch (err) {
        contextLogger().warn(
          { event: "lms.sync.cover_fetch_failed", slug: curso.slug, err: String(err) },
          "lms cover fetch failed",
        )
      }

      // Campos sincronizaveis (conteudo). Preco/categoria/visibilidade ficam de
      // fora — curadoria admin.
      const dataBase = {
        provider: "LMS" as const,
        lmsCourseId: curso.id,
        lmsSlug: curso.slug,
        nome: curso.title,
        descricao: curso.description || null,
        qtdAulas: curso.lessonCount ?? 0,
        cargaHoraria: curso.workload || null,
        status: "ATIVO",
        ...(coverImage ? { capaImageUrl: coverImage } : {}),
        syncedAt: new Date(),
      }

      const existing = await prisma.course.findUnique({
        where: { lmsCourseId: curso.id },
        select: { id: true },
      })

      if (existing) {
        await prisma.course.update({
          where: { lmsCourseId: curso.id },
          data: dataBase,
        })
        updated += 1
      } else {
        await prisma.course.create({
          data: {
            ...dataBase,
            slug: await ensureUniqueCourseSlug(slugify(curso.slug || curso.title)),
          },
        })
        added += 1
      }
    }

    const durationMs = Date.now() - start

    const entry: SyncLogEntry = {
      id: `sync_lms_${Date.now()}`,
      at: new Date().toISOString(),
      status: "SUCCESS",
      added,
      updated,
      totalInEa: cursos.length,
      message:
        source === "manual"
          ? "Sincronização LMS manual via admin"
          : "Sincronização LMS automática (cron)",
      source,
      durationMs,
    }
    await pushSyncLog(entry)

    return { added, updated, totalInEa: cursos.length, durationMs }
  } catch (error) {
    const durationMs = Date.now() - start
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await pushSyncLog({
      id: `sync_lms_${Date.now()}`,
      at: new Date().toISOString(),
      status: "FAILURE",
      added: 0,
      updated: 0,
      totalInEa: 0,
      message: `LMS: ${message}`,
      source,
      durationMs,
    })
    throw error
  }
}
