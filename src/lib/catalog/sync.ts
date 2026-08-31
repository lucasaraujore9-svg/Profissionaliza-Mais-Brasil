import { prisma } from "@/lib/prisma"
import { listarCursos } from "@/lib/plataforma-cursos/client"
import type { EACurso } from "@/lib/plataforma-cursos/types"
import { contextLogger } from "@/lib/logger"
import { parseBRPrice, slugify } from "@/lib/utils"
import { pushSyncLog, type SyncLogEntry } from "./sync-log"
import { slugifyCategoria } from "./home"

const TITLECASE_LOWER_WORDS = new Set(["e", "de", "da", "do", "das", "dos", "para", "com", "em"])

function titleCaseCategoria(nome: string): string {
  const words = nome.toLowerCase().split(/\s+/)
  return words
    .map((w, i) => {
      if (i > 0 && TITLECASE_LOWER_WORDS.has(w)) return w
      return w.replace(/^\p{L}/u, (m) => m.toUpperCase())
    })
    .join(" ")
}

const categoryCache = new Map<string, string>()

/**
 * Garante que existe uma Category para o `categoriaLoja` recebido do sync e
 * retorna o `categoryId`. Idempotente: se ja existe, reutiliza. Renomear ou
 * desativar Category fica a cargo do admin via CRUD — o sync nunca sobrescreve.
 */
async function ensureCategory(
  categoriaLojaRaw: string | null,
): Promise<string | null> {
  if (!categoriaLojaRaw) return null
  const raw = categoriaLojaRaw.trim()
  if (!raw) return null

  if (categoryCache.has(raw)) {
    return categoryCache.get(raw) ?? null
  }

  const name = titleCaseCategoria(raw)
  const slug = slugifyCategoria(raw)

  // Procura por slug primeiro (slug e' a chave estavel mesmo se o nome muda).
  const existing = await prisma.category.findFirst({
    where: { OR: [{ slug }, { name }] },
    select: { id: true },
  })
  if (existing) {
    categoryCache.set(raw, existing.id)
    return existing.id
  }

  const created = await prisma.category.create({
    data: { name, slug, isActive: true, displayOrder: 0 },
    select: { id: true },
  })
  categoryCache.set(raw, created.id)
  return created.id
}

/**
 * O endpoint cursos/listar nao retorna o ID numerico do curso na plataforma.
 * Por convencao, a URL da capa segue o padrao
 *   https://<host>/oficial/metodo/imagemcursos/<id>.<ext>
 * (ou .../<id>.jpeg, .png, ...). Quando o admin sobe outra imagem com nome
 * diferente, retornamos null e mantem o plataformaCourseId previo (se houver).
 */
export function extractCourseIdFromCapa(
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

/**
 * Colunas lidas do curso ja existente para decidir o UPDATE. `nome` entra aqui
 * porque o match agora pode casar por ID e encontrar a linha com o nome ANTIGO —
 * e a diferenca e o que denuncia uma renomeacao na fornecedora.
 */
const EA_MATCH_SELECT = {
  id: true,
  nome: true,
  plataformaCourseId: true,
  categoryId: true,
  status: true,
  categoriaLoja: true,
} as const

/**
 * Upsert de UM curso do feed da fornecedora legada -> `Course`.
 *
 * Extraido do corpo do loop para que uma linha problematica falhe SOZINHA. Antes
 * um unico throw (ex.: colisao no indice unico de nome) abortava o sync do
 * catalogo INTEIRO, e a rede passava o dia com o catalogo da vespera.
 */
async function upsertEaCourse(curso: EACurso): Promise<{ created: boolean }> {
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

  const courseIdFromCapa = extractCourseIdFromCapa(curso.capa_image)

  const categoriaLojaTrim = curso.categoria_loja?.trim() || null
  const categoryId = await ensureCategory(categoriaLojaTrim)

  const dataBase = {
    nome: curso.nome,
    descricao: curso.obs || null,
    qtdAulas,
    cargaHoraria: curso.carga_horaria || null,
    precoOriginal: precoOriginal && precoOriginal > 0 ? precoOriginal : null,
    precoPromocional: precoPromo && precoPromo > 0 ? precoPromo : null,
    parcelasSugeridas: parcelas,
    categoriaInterna: curso.categoria_interna || null,
    categoriaLoja: categoriaLojaTrim,
    categoryId,
    destaque: isDestaque,
    status: curso.status || "ATIVO",
    precoMostrar: isPrecoMostrar,
    capaImageUrl: curso.capa_image || null,
    syncedAt: new Date(),
  }

  // ── IDENTIDADE DO CURSO: o ID da fornecedora primeiro; o nome so como
  // fallback ────────────────────────────────────────────────────────────────
  //
  // O nome e MUTAVEL na fornecedora e nunca serviu de chave. Quando o curso 267
  // foi renomeado de "Auxiliar Corretor de Imoveis" para "Preparatorio para
  // Corretor de Imoveis", o match por nome nao achou nada e o sync criou uma
  // linha NOVA — que ainda por cima nasceu SEM `plataformaCourseId`, porque o
  // 267 ja estava tomado pela linha antiga (a coluna e `@unique`). Resultado: o
  // mesmo curso duplicado em 18 vitrines, a copia velha com o preco velho, e a
  // copia nova IMPOSSIVEL de provisionar — toda venda e toda liberacao morriam
  // em `linkCourseToStudent` ("sem plataforma_course_id") DEPOIS de o aluno ja
  // ter sido cobrado.
  //
  // `courseIdFromCapa` e o unico identificador estavel que o feed expoe: o
  // endpoint cursos/listar nao devolve o id numerico, ele vem embutido na URL da
  // capa. Casar por ele transforma uma renomeacao em UPDATE da linha existente.
  //
  // `authorTenantId: null` nas DUAS consultas e a trava anti-SEQUESTRO: se uma
  // unidade publicar "Excel Basico" e a fornecedora tiver um curso de mesmo
  // nome, sem ela o sync reescreveria o produto da unidade com os dados do feed
  // todo dia as 6h.
  //
  // findFirst (nao findUnique) porque o Prisma nao aceita coluna nula num unique
  // composto; a unicidade real e garantida pelo indice parcial
  // `courses_provider_nome_pmb_key` (migration 20260821_course_authoring).
  const existing =
    (courseIdFromCapa
      ? await prisma.course.findFirst({
          where: {
            provider: "EA",
            plataformaCourseId: courseIdFromCapa,
            authorTenantId: null,
          },
          select: EA_MATCH_SELECT,
        })
      : null) ??
    (await prisma.course.findFirst({
      where: { provider: "EA", nome: curso.nome, authorTenantId: null },
      select: EA_MATCH_SELECT,
    }))

  if (existing && existing.nome !== curso.nome) {
    contextLogger().info(
      {
        event: "catalog.sync_ea.renamed",
        courseId: existing.id,
        plataformaCourseId: courseIdFromCapa,
        de: existing.nome,
        para: curso.nome,
      },
      "curso renomeado na fornecedora — aplicado na linha existente",
    )
  }

  // Em update, so substitui categoryId se o curso ainda nao tem um vinculo
  // manual. Isso preserva remapeamentos feitos pelo admin (ex: o curso
  // "Excel Avancado" foi movido manualmente de "Informatica" para "Diversas
  // Areas" — o sync subsequente nao deve reverter).
  const effectiveCategoryId = existing?.categoryId ?? categoryId

  // plataformaCourseId tem unique constraint. So escreve quando:
  // 1) tem id extraido da capa
  // 2) ainda nao esta usado por outro curso (ou esta usado pelo proprio)
  let canSetEaCourseId = false
  if (courseIdFromCapa) {
    if (existing?.plataformaCourseId === courseIdFromCapa) {
      canSetEaCourseId = false // ja correto, nao precisa atualizar
    } else {
      const conflict = await prisma.course.findUnique({
        where: { plataformaCourseId: courseIdFromCapa },
        select: { id: true, nome: true },
      })
      if (!conflict || conflict.id === existing?.id) {
        canSetEaCourseId = true
      } else {
        // O ID da capa pertence a OUTRA linha do catalogo. Com o match por ID
        // acima isso deixou de ser o caminho comum, mas quando acontece a linha
        // fica sem ID — visivel na vitrine e impossivel de provisionar. Ruido
        // visivel de proposito: alguem precisa unificar as duas no /admin.
        contextLogger().warn(
          {
            event: "catalog.sync_ea.duplicate_platform_id",
            plataformaCourseId: courseIdFromCapa,
            nomeNoFeed: curso.nome,
            ocupadoPor: { id: conflict.id, nome: conflict.nome },
          },
          "id da fornecedora ja pertence a outro curso — linha ficara sem id e fora das vitrines",
        )
      }
    }
  }

  // Um curso que a fornecedora nao consegue provisionar nao pode nascer
  // vendavel. `COURSE_PROVISIONABLE` ja o tira das vitrines, mas nascer oculto
  // na vitrine-mae torna o estado visivel para o admin em /admin/catalogo em
  // vez de simplesmente "sumir".
  const provisionavel = Boolean(
    canSetEaCourseId || existing?.plataformaCourseId,
  )

  if (existing) {
    await prisma.course.update({
      where: { id: existing.id },
      data: {
        ...dataBase,
        categoryId: effectiveCategoryId,
        // Curadoria do admin NAO e revertida pelo sync (mesma regra do
        // categoryId acima): `status` (ativo/inativo) e `categoriaLoja` sao
        // editaveis em /admin/catalogo e ficavam voltando ao valor do feed a
        // cada sync diario. So o CREATE define esses campos a partir do feed.
        status: existing.status,
        categoriaLoja: existing.categoriaLoja,
        ...(canSetEaCourseId ? { plataformaCourseId: courseIdFromCapa } : {}),
      },
    })
    await linkCourseCategory(existing.id, effectiveCategoryId)
    return { created: false }
  }

  const created = await prisma.course.create({
    data: {
      ...dataBase,
      slug: await ensureUniqueCourseSlug(slug),
      hiddenMain: !provisionavel,
      ...(canSetEaCourseId ? { plataformaCourseId: courseIdFromCapa } : {}),
    },
    select: { id: true },
  })
  await linkCourseCategory(created.id, effectiveCategoryId)
  return { created: true }
}

/**
 * Garante que a categoria efetiva consta no join M2M, SEM remover as categorias
 * adicionais atribuidas manualmente pelo admin. O join e a fonte de verdade para
 * filtros/contagens.
 */
async function linkCourseCategory(
  courseId: string,
  categoryId: string | null,
): Promise<void> {
  if (!categoryId) return
  await prisma.courseCategory.upsert({
    where: { courseId_categoryId: { courseId, categoryId } },
    create: { courseId, categoryId },
    update: {},
  })
}

export async function syncCatalogFromEA(
  source: "manual" | "cron",
): Promise<SyncResult> {
  const start = Date.now()

  try {
    const cursos = await listarCursos()

    let added = 0
    let updated = 0
    let failed = 0

    for (const curso of cursos) {
      if (!curso.nome) continue

      // Falha ISOLADA por curso: uma linha problematica nao pode derrubar o
      // catalogo inteiro. O caso concreto e a colisao de nome no indice unico
      // parcial quando a fornecedora troca dois nomes entre si — sem este
      // try/catch, o sync inteiro aborta e a rede fica com o catalogo da vespera.
      try {
        const { created } = await upsertEaCourse(curso)
        if (created) added += 1
        else updated += 1
      } catch (err) {
        failed += 1
        contextLogger().error(
          { err, event: "catalog.sync_ea.course_failed", nome: curso.nome },
          "sync de um curso da fornecedora falhou — os demais seguem",
        )
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
        (source === "manual"
          ? "Sincronização manual via admin"
          : "Sincronização automática (cron)") +
        (failed > 0 ? ` — ${failed} curso(s) falharam` : ""),
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

/**
 * Garante um slug unico GLOBAL para Course (a coluna `slug` e `@unique` e
 * compartilhada por todas as fornecedoras). Sufixa numericamente em caso de
 * colisao. Compartilhado entre o sync EA e o sync LMS.
 */
export async function ensureUniqueCourseSlug(base: string): Promise<string> {
  const root = base || "curso"
  let slug = root
  let suffix = 1
  while (
    await prisma.course.findUnique({ where: { slug }, select: { id: true } })
  ) {
    slug = `${root}-${suffix++}`
    if (suffix > 50) break
  }
  return slug
}
