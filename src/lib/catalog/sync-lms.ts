import { prisma } from "@/lib/prisma"
import {
  listLmsCourses,
  getLmsCourse,
  type LmsModule,
  type LmsCategory,
  type LmsCurriculumItem,
} from "@/lib/lms"
import { slugify } from "@/lib/utils"
import { contextLogger } from "@/lib/logger"
import { pushSyncLog, type SyncLogEntry } from "./sync-log"
import { slugifyCategoria } from "./home"
import { ensureCourseForResellers } from "@/lib/tenant/ensure-courses"
import { ensureUniqueCourseSlug, type SyncResult } from "./sync"

// Cache por UUID da categoria LMS (chave estavel) -> Category.id do PMB.
const lmsCategoryCache = new Map<string, string>()

/**
 * Converte a matriz curricular (grade) do LMS na lista de topicos do PMB
 * (`Course.matrizCurricular: string[]`). Ordena por `order` e usa o `title` de
 * cada item como topico, descartando vazios. Retorna `null` quando o LMS NAO
 * enviou o campo (resposta antiga) — nesse caso o sync nao mexe na matriz atual.
 * `[]` (enviado vazio) => matriz limpa de proposito.
 */
export function mapCurriculumToMatriz(
  curriculum: LmsCurriculumItem[] | undefined,
): string[] | null {
  if (!Array.isArray(curriculum)) return null
  return [...curriculum]
    .sort((a, b) => a.order - b.order)
    .map((c) => (c.title ?? "").trim())
    .filter((s) => s.length > 0)
}

/**
 * Garante que existe uma Category no PMB para a categoria recebida do LMS e
 * retorna o `categoryId`. Idempotente: reusa por slug OU nome (casa com
 * categorias ja criadas pelo sync EA de mesmo nome). Renomear/desativar Category
 * fica a cargo do admin — o sync nunca sobrescreve nome/slug de uma existente.
 */
async function ensureLmsCategory(cat: LmsCategory): Promise<string | null> {
  const name = cat.name?.trim()
  if (!name) return null

  if (lmsCategoryCache.has(cat.id)) {
    return lmsCategoryCache.get(cat.id) ?? null
  }

  // Slug estavel: usa o do LMS quando presente, senao deriva do nome (mesma
  // funcao do sync EA, pra maximizar o match com categorias existentes).
  const slug = cat.slug?.trim() || slugifyCategoria(name)

  const existing = await prisma.category.findFirst({
    where: { OR: [{ slug }, { name }] },
    select: { id: true },
  })
  if (existing) {
    lmsCategoryCache.set(cat.id, existing.id)
    return existing.id
  }

  const created = await prisma.category.create({
    data: { name, slug, isActive: true, displayOrder: 0 },
    select: { id: true },
  })
  lmsCategoryCache.set(cat.id, created.id)
  return created.id
}

/**
 * Sincroniza o catalogo da nova fornecedora (LMS lms.bmbr.com.br) para Course.
 *
 * Diferencas em relacao ao syncCatalogFromEA:
 *  - Match por `lmsCourseId` (UUID estavel), nao por nome.
 *  - Cada linha nasce/permanece provider=LMS; o sync NUNCA toca em cursos EA.
 *  - Preco SUGERIDO (suggestedPriceCents), categorias (N-N) e matriz curricular
 *    (curriculum) vem do LMS: o preco entra em `precoOriginal` (preco-base), as
 *    categorias no join M2M e a matriz em `matrizCurricular` (topicos). O override
 *    do admin (`precoVitrineMain`) e o remapeamento manual de categoria principal
 *    sao PRESERVADOS — o sync so preenche o preco-base e ADICIONA categorias. A
 *    matriz e re-sincronizada (LMS e dono do conteudo); campo ausente => nao mexe.
 *  - Curso NOVO importado COM valor E categoria nasce ATIVO na vitrine mae
 *    (hiddenMain=false) e em todas as revendas (visibilityMode=ALL default +
 *    status=ATIVO + gate de preco satisfeito). Sem valor OU sem categoria nasce
 *    oculto na mae. So no create — em update a visibilidade e curadoria do admin.
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

      // Preco SUGERIDO (centavos -> reais). E so referencia/preco-base: entra em
      // `precoOriginal`, o mesmo campo que o sync EA alimenta. O override do admin
      // vive em `precoVitrineMain` e NUNCA e tocado pelo sync, entao re-sincronizar
      // o preco sugerido nao apaga a curadoria. suggestedPriceCents ausente/0 => null.
      const precoOriginal =
        curso.suggestedPriceCents != null && curso.suggestedPriceCents > 0
          ? curso.suggestedPriceCents / 100
          : null

      // Categorias (N-N). Resolve cada uma para uma Category do PMB (cria se
      // preciso). Dedup preservando ordem — a primeira e a candidata a principal.
      const resolvedCategoryIds: string[] = []
      for (const cat of curso.categories ?? []) {
        const catId = await ensureLmsCategory(cat)
        if (catId && !resolvedCategoryIds.includes(catId)) {
          resolvedCategoryIds.push(catId)
        }
      }
      const firstCategoryId = resolvedCategoryIds[0] ?? null

      // Matriz curricular (grade) vinda do LMS -> topicos do PMB. Curso LMS tem o
      // LMS como dono do conteudo, entao a matriz e re-sincronizada (como descricao/
      // aulas). `null` = campo ausente na resposta => nao mexe na matriz atual.
      const matrizCurricular = mapCurriculumToMatriz(curso.curriculum)

      // Campos sincronizaveis. Preco sugerido, categoria e matriz agora vem do LMS;
      // visibilidade (hiddenMain/visibilityMode) segue curadoria do admin.
      const dataBase = {
        provider: "LMS" as const,
        lmsCourseId: curso.id,
        lmsSlug: curso.slug,
        nome: curso.title,
        descricao: curso.description || null,
        qtdAulas: curso.lessonCount ?? 0,
        cargaHoraria: curso.workload || null,
        precoOriginal,
        ...(matrizCurricular !== null ? { matrizCurricular } : {}),
        status: "ATIVO",
        ...(coverImage ? { capaImageUrl: coverImage } : {}),
        syncedAt: new Date(),
      }

      const existing = await prisma.course.findUnique({
        where: { lmsCourseId: curso.id },
        select: { id: true, categoryId: true, status: true },
      })

      // Em update, so define a principal se o curso ainda nao tem uma — preserva
      // remapeamentos manuais do admin (mesma regra do sync EA).
      const effectiveCategoryId = existing?.categoryId ?? firstCategoryId

      // Curso importado COM valor E categoria nasce ATIVO em todo lugar:
      //  - vitrine mae PMB: hiddenMain=false (visivel);
      //  - todas as revendas: visibilityMode=ALL (default) + status=ATIVO liberam
      //    o curso, e a propagacao explicita abaixo (ensureCourseForResellers) cria
      //    o TenantCourse de cada revenda com preco/isVisible — sem isso a vitrine
      //    publica so o mostraria depois que o painel da revenda sincronizasse.
      // Sem valor OU sem categoria: nasce oculto na mae ate o admin completar os
      // dados (o gate de preco em runtime ainda protege as vitrines de qualquer
      // forma). So vale no CREATE — em update nao mexemos em hiddenMain (curadoria
      // do admin, que pode ter ocultado de proposito).
      const nasceAtivo =
        precoOriginal != null &&
        precoOriginal > 0 &&
        resolvedCategoryIds.length > 0

      let courseId: string
      if (existing) {
        await prisma.course.update({
          where: { lmsCourseId: curso.id },
          // `status` preservado no update: `dataBase` fixa "ATIVO", o que revertia
          // a curadoria do admin (ex: curso marcado INATIVO em /admin/catalogo
          // voltava a ATIVO no sync diario). So o CREATE nasce ATIVO.
          data: { ...dataBase, categoryId: effectiveCategoryId, status: existing.status },
        })
        courseId = existing.id
        updated += 1
      } else {
        const created = await prisma.course.create({
          data: {
            ...dataBase,
            categoryId: effectiveCategoryId,
            hiddenMain: !nasceAtivo,
            slug: await ensureUniqueCourseSlug(slugify(curso.slug || curso.title)),
          },
          select: { id: true },
        })
        courseId = created.id
        added += 1
      }

      // Garante que as categorias do LMS constam no join M2M, SEM remover as
      // adicionais atribuidas manualmente pelo admin. O join e a fonte de verdade
      // para filtros/contagens (aditivo, igual ao sync EA).
      for (const categoryId of resolvedCategoryIds) {
        await prisma.courseCategory.upsert({
          where: { courseId_categoryId: { courseId, categoryId } },
          create: { courseId, categoryId },
          update: {},
        })
      }

      // Curso NOVO que nasceu ativo (valor + categoria): propaga para todas as
      // revendas agora — a vitrine publica delas nao roda ensureTenantCourses
      // sozinha, entao sem isto so apareceria depois que o painel da revenda
      // sincronizasse. Best-effort: falha aqui nao aborta o sync do catalogo.
      if (!existing && nasceAtivo) {
        await ensureCourseForResellers(courseId).catch((err) => {
          contextLogger().warn(
            { event: "lms.sync.propagate_failed", slug: curso.slug, err: String(err) },
            "propagacao do curso LMS para revendas falhou",
          )
        })
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
