import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  validateSectionPayload,
  CATEGORY_SECTION_MIN_COURSES,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  type AnySectionConfig,
} from "./sections"

/** Primeira mensagem de erro de um ZodError, achatada para o envelope `{ error }`. */
function firstZodError(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Payload inválido"
}

interface Scope {
  tenantId: string | null
}

/**
 * Conta os cursos ativos e visíveis no catálogo vinculados a uma categoria.
 * Base para o gate de ativação de seções category_courses (≥8 cursos). É uma
 * propriedade da categoria no catálogo global — independe do tenant.
 */
async function countActiveCategoryCourses(categoryId: string): Promise<number> {
  return prisma.course.count({
    where: {
      categoryLinks: { some: { categoryId } },
      status: "ATIVO",
      hiddenMain: false,
    },
  })
}

/** Extrai o `categoryId` de uma config (nova ou persistida) de category_courses. */
function readCategoryId(config: unknown): string | null {
  if (config && typeof config === "object" && "categoryId" in config) {
    const v = (config as Record<string, unknown>).categoryId
    return typeof v === "string" && v.length > 0 ? v : null
  }
  return null
}

export async function listSections(scope: Scope) {
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({
    data: sections.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      kind: s.kind,
      position: s.position,
      enabled: s.enabled,
      config: s.config,
    })),
  })
}

export async function createSection(scope: Scope, body: unknown) {
  const envelope = createSectionSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(
      { error: firstZodError(envelope.error) },
      { status: 400 },
    )
  }
  const { kind, config } = envelope.data
  // Validação granular por kind (regras de negócio: contagem, singletons, etc.)
  const validation = validateSectionPayload(kind, config)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Singletons: bestsellers, categories_grid, tecnica, eja e idiomas só podem
  // existir uma vez por escopo.
  if (
    validation.kind === "bestsellers" ||
    validation.kind === "categories_grid" ||
    validation.kind === "tecnica" ||
    validation.kind === "eja" ||
    validation.kind === "idiomas"
  ) {
    const exists = await prisma.homeSection.findFirst({
      where: { tenantId: scope.tenantId, kind: validation.kind },
      select: { id: true },
    })
    if (exists) {
      const message =
        validation.kind === "bestsellers"
          ? "Já existe uma seção “Mais vendidos” — edite a existente"
          : validation.kind === "tecnica"
            ? "Já existe a seção “Cursos Técnicos” — edite a existente"
            : validation.kind === "eja"
              ? "Já existe a seção “EJA” — edite a existente"
              : validation.kind === "idiomas"
                ? "Já existe a seção “Idiomas” — edite a existente"
                : "Já existe um bloco de categorias — edite o existente"
      return NextResponse.json({ error: message }, { status: 409 })
    }
  }

  if (validation.kind === "category_courses") {
    const cfg = validation.config as Extract<AnySectionConfig, { kind: "category_courses" }>
    const exists = await prisma.homeSection.findFirst({
      where: {
        tenantId: scope.tenantId,
        kind: "category_courses",
        config: { path: ["categoryId"], equals: cfg.categoryId },
      },
      select: { id: true },
    })
    if (exists) {
      return NextResponse.json(
        { error: "Já existe uma seção para essa categoria" },
        { status: 409 },
      )
    }
    if (cfg.mode === "random") {
      const courseCount = await prisma.course.count({
        where: {
          categoryLinks: { some: { categoryId: cfg.categoryId } },
          status: "ATIVO",
          hiddenMain: false,
        },
      })
      if (courseCount < 4) {
        return NextResponse.json(
          { error: `Categoria precisa ter pelo menos 4 cursos ativos (encontrado: ${courseCount})` },
          { status: 400 },
        )
      }
    }
    // Seção nasce ativada (enabled:true) — só permite se a categoria já tem o
    // mínimo de cursos para aparecer na home. (O fan-out automático em
    // /api/admin/catalogo/categorias cria a seção DESATIVADA por fora, então
    // não passa por aqui.)
    const activeCount = await countActiveCategoryCourses(cfg.categoryId)
    if (activeCount < CATEGORY_SECTION_MIN_COURSES) {
      return NextResponse.json(
        {
          error: `Esta categoria tem ${activeCount} curso(s). Adicione pelo menos ${CATEGORY_SECTION_MIN_COURSES} para ativar a seção na home.`,
        },
        { status: 400 },
      )
    }
  }

  const last = await prisma.homeSection.findFirst({
    where: { tenantId: scope.tenantId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  const nextPosition = (last?.position ?? -1) + 1

  const created = await prisma.homeSection.create({
    data: {
      tenantId: scope.tenantId,
      kind: validation.kind,
      position: nextPosition,
      enabled: true,
      config: validation.config as unknown as Prisma.InputJsonValue,
    },
  })
  return NextResponse.json({ data: created }, { status: 201 })
}

export async function updateSection(
  scope: Scope,
  id: string,
  body: unknown,
): Promise<Response> {
  const slide = await prisma.homeSection.findFirst({
    where: { id, tenantId: scope.tenantId },
  })
  if (!slide) {
    return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 })
  }
  const envelope = updateSectionSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(
      { error: firstZodError(envelope.error) },
      { status: 400 },
    )
  }
  const b = envelope.data
  const updates: {
    config?: Prisma.InputJsonValue
    enabled?: boolean
    position?: number
  } = {}

  // Conteúdo das seções padronizadas pela PMB (idiomas/tecnica/eja) NÃO é
  // editável por revendedor: a vitrine herda o conteúdo da PMB no render; a
  // unidade só altera position/enabled. Ignora qualquer `config` enviado em
  // escopo de tenant para essas kinds — enforcement server-side do lock que o
  // painel já mostra (caso contrário um PATCH manual sobrescreveria título/
  // subtítulo da seção idiomas na vitrine da unidade).
  const isPmbStandardizedKind =
    slide.kind === "idiomas" || slide.kind === "tecnica" || slide.kind === "eja"
  const ignoreTenantConfig = scope.tenantId !== null && isPmbStandardizedKind

  if (b.config !== undefined && !ignoreTenantConfig) {
    const validation = validateSectionPayload(slide.kind, b.config)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    if (validation.kind === "category_courses") {
      const cfg = validation.config as Extract<AnySectionConfig, { kind: "category_courses" }>
      if (cfg.mode === "random") {
        const courseCount = await prisma.course.count({
          where: {
            categoryLinks: { some: { categoryId: cfg.categoryId } },
            status: "ATIVO",
            hiddenMain: false,
          },
        })
        if (courseCount < 4) {
          return NextResponse.json(
            { error: `Categoria precisa ter pelo menos 4 cursos ativos (encontrado: ${courseCount})` },
            { status: 400 },
          )
        }
      }
    }
    updates.config = validation.config as unknown as Prisma.InputJsonValue
  }

  if (b.enabled !== undefined) {
    if (slide.kind === "bestsellers" && b.enabled !== true) {
      return NextResponse.json(
        { error: "A seção “Mais vendidos” não pode ser desativada" },
        { status: 400 },
      )
    }
    // Gate: só permite ATIVAR uma seção de categoria quando a categoria já tem
    // o mínimo de cursos. Desativar é sempre permitido. Usa o categoryId da
    // config nova (se enviada na mesma chamada) ou da persistida.
    if (b.enabled === true && slide.kind === "category_courses") {
      const categoryId =
        readCategoryId(updates.config) ?? readCategoryId(slide.config)
      if (categoryId) {
        const activeCount = await countActiveCategoryCourses(categoryId)
        if (activeCount < CATEGORY_SECTION_MIN_COURSES) {
          return NextResponse.json(
            {
              error: `Esta categoria tem ${activeCount} curso(s). Adicione pelo menos ${CATEGORY_SECTION_MIN_COURSES} para ativar a seção na home.`,
            },
            { status: 400 },
          )
        }
      }
    }
    updates.enabled = b.enabled
  }

  if (b.position !== undefined) {
    // schema já garante number finito >= 0; só normaliza para inteiro.
    updates.position = Math.floor(b.position)
  }

  const updated = await prisma.homeSection.update({
    where: { id },
    data: updates,
  })

  await normalizePositions(scope)

  return NextResponse.json({ data: updated })
}

export async function deleteSection(scope: Scope, id: string): Promise<Response> {
  const slide = await prisma.homeSection.findFirst({
    where: { id, tenantId: scope.tenantId },
    select: { id: true, kind: true },
  })
  if (!slide) {
    return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 })
  }
  if (slide.kind === "bestsellers") {
    return NextResponse.json(
      { error: "A seção “Mais vendidos” não pode ser removida" },
      { status: 400 },
    )
  }
  if (slide.kind === "tecnica") {
    return NextResponse.json(
      { error: "A seção “Cursos Técnicos” não pode ser removida — desative-a se não quiser exibi-la" },
      { status: 400 },
    )
  }
  if (slide.kind === "eja") {
    return NextResponse.json(
      { error: "A seção “EJA” não pode ser removida — desative-a se não quiser exibi-la" },
      { status: 400 },
    )
  }
  if (slide.kind === "idiomas") {
    return NextResponse.json(
      { error: "A seção “Idiomas” não pode ser removida — desative-a se não quiser exibi-la" },
      { status: 400 },
    )
  }
  await prisma.homeSection.delete({ where: { id } })
  await normalizePositions(scope)
  return NextResponse.json({ data: { ok: true } })
}

export async function reorderSections(scope: Scope, body: unknown): Promise<Response> {
  const envelope = reorderSectionsSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(
      { error: "order deve ser array de IDs" },
      { status: 400 },
    )
  }
  const ids = envelope.data.order
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: scope.tenantId, id: { in: ids } },
    select: { id: true, kind: true },
  })
  if (sections.length !== ids.length) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 })
  }
  // DB-004: updates SEQUENCIAIS (nao prisma.$transaction([...map])). O array
  // dinamico de updates sobre adapter-pg + pooler do Supabase derruba o lote
  // inteiro em prod ("nao salva", vide 019a253). position nao e unique.
  for (const [idx, id] of ids.entries()) {
    await prisma.homeSection.update({ where: { id }, data: { position: idx } })
  }
  await normalizePositions(scope)
  return NextResponse.json({ data: { ok: true } })
}

/**
 * Mantém uma única invariante: entre seções de cursos (bestsellers e
 * category_courses), bestsellers deve vir primeiro. Institutional e
 * categories_grid podem aparecer em qualquer ordem.
 *
 * Algoritmo: se a posição de bestsellers > posição mínima de algum
 * category_courses, swap bestsellers com aquele category_courses; depois
 * compacta as positions (0..n-1).
 */
async function normalizePositions(scope: Scope) {
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  const idxBest = sections.findIndex((s) => s.kind === "bestsellers")
  if (idxBest >= 0) {
    const idxFirstCategoryCourses = sections.findIndex(
      (s, i) => i !== idxBest && s.kind === "category_courses",
    )
    if (idxFirstCategoryCourses >= 0 && idxFirstCategoryCourses < idxBest) {
      // bestsellers veio depois de um category_courses — move bestsellers
      // pra logo antes do primeiro category_courses.
      const [best] = sections.splice(idxBest, 1)
      sections.splice(idxFirstCategoryCourses, 0, best)
    }
  }
  // DB-004: updates SEQUENCIAIS (nao prisma.$transaction([...map])) — mesmo
  // motivo de reorderSections. Percorre em ordem de position final.
  for (let i = 0; i < sections.length; i++) {
    await prisma.homeSection.update({ where: { id: sections[i].id }, data: { position: i } })
  }
}
