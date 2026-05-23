import { prisma } from "@/lib/prisma"
import { listarCursos } from "@/lib/plataforma-cursos/client"
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

      const existing = await prisma.course.findUnique({
        where: { nome: curso.nome },
        select: { id: true, plataformaCourseId: true, categoryId: true },
      })

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
            categoryId: effectiveCategoryId,
            ...(canSetEaCourseId
              ? { plataformaCourseId: courseIdFromCapa }
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
              ? { plataformaCourseId: courseIdFromCapa }
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
