import { prisma } from "@/lib/prisma"
import { listLmsCourses, getLmsCourse, type LmsModule } from "@/lib/lms"
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
 *  - Capa (coverImage) E as aulas (modules[].lessons[]) vem do detalhe
 *    /courses/:slug (1 call extra por curso; catalogo e pequeno). A cada sync os
 *    dados de conteudo (titulo, descricao, carga, capa, aulas) sao
 *    re-sincronizados para refletir edicoes feitas no LMS. Falha ao buscar o
 *    detalhe nao aborta o curso (mantem o conteudo anterior).
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

      // Capa + aulas vem so no detalhe — best-effort. modules=null => detalhe
      // falhou e NAO mexemos nas aulas existentes (evita apagar por erro de rede).
      let coverImage: string | null = null
      let modules: LmsModule[] | null = null
      try {
        const detail = await getLmsCourse(curso.slug)
        coverImage = detail.coverImage || null
        modules = detail.modules ?? []
      } catch (err) {
        contextLogger().warn(
          { event: "lms.sync.detail_fetch_failed", slug: curso.slug, err: String(err) },
          "lms detail fetch failed",
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

      let courseId: string
      if (existing) {
        await prisma.course.update({
          where: { lmsCourseId: curso.id },
          data: dataBase,
        })
        courseId = existing.id
        updated += 1
      } else {
        const created = await prisma.course.create({
          data: {
            ...dataBase,
            // Nasce OCULTO da vitrine PMB: o LMS nao fornece preco e a regra do
            // negocio e "curso sem valor nao pode ser exibido". O admin libera
            // depois de definir o preco (a vitrine ainda aplica o gate de preco
            // em runtime, entao isto e o default amigavel — nao a unica defesa).
            hiddenMain: true,
            slug: await ensureUniqueCourseSlug(slugify(curso.slug || curso.title)),
          },
          select: { id: true },
        })
        courseId = created.id
        added += 1
      }

      // Sincroniza as aulas (CourseLesson) a partir do detalhe do LMS para
      // refletir edicoes de aulas. So quando o detalhe foi obtido (modules != null).
      if (modules) {
        await syncCourseLessons(courseId, modules).catch((err) => {
          contextLogger().warn(
            { event: "lms.sync.lessons_failed", slug: curso.slug, err: String(err) },
            "lms lesson sync failed",
          )
        })
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

/**
 * Substitui as aulas (CourseLesson) de um curso pelas aulas atuais do LMS.
 *
 * Achata `modules[].lessons[]` numa lista unica ordenada (modulos por `order`,
 * depois aulas por `order`) e RENUMERA sequencialmente em `ordem` (0,1,2,...) —
 * o `order` do LMS pode ter buracos (ex.: 0,1,3,4) e `CourseLesson` tem
 * `@@unique([courseId, ordem])`. O nome da aula vira `lesson.title`.
 *
 * Estrategia delete+recreate numa transacao: o jeito mais simples de refletir o
 * estado atual do LMS (incluindo aulas removidas/renomeadas/reordenadas).
 * CourseLesson nao e referenciada por matricula/certificado, entao recriar e
 * seguro.
 */
async function syncCourseLessons(
  courseId: string,
  modules: LmsModule[],
): Promise<void> {
  const lessons: { courseId: string; nome: string; ordem: number }[] = []
  let ordem = 0
  for (const m of [...modules].sort((a, b) => a.order - b.order)) {
    for (const l of [...(m.lessons ?? [])].sort((a, b) => a.order - b.order)) {
      const nome = (l.title ?? "").trim()
      if (!nome) continue
      lessons.push({ courseId, nome, ordem: ordem++ })
    }
  }

  await prisma.$transaction([
    prisma.courseLesson.deleteMany({ where: { courseId } }),
    ...(lessons.length > 0
      ? [prisma.courseLesson.createMany({ data: lessons })]
      : []),
  ])
}
