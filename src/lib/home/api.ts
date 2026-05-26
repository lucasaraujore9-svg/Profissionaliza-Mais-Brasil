import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  validateSectionPayload,
  type AnySectionConfig,
} from "./sections"

/**
 * Operações compartilhadas entre /api/admin/home-sections e /api/painel/home-sections.
 *
 * `scope.tenantId === null` => operando sobre as seções globais (PMB);
 * `scope.tenantId === "abc123"` => operando sobre as seções daquela revenda.
 *
 * Cada handler aqui assume que o caller (route file) já validou autenticação
 * e permissão antes de chamar.
 */

interface Scope {
  tenantId: string | null
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

/**
 * POST /api/.../home-sections — cria uma nova seção.
 * Body: { kind, config }. position é calculado (último).
 * Para bestsellers: força enabled=true e bloqueia duplicata.
 */
export async function createSection(scope: Scope, body: unknown) {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }
  const { kind, config } = body as Record<string, unknown>
  const validation = validateSectionPayload(kind, config)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }
  // Para bestsellers: só pode existir uma por escopo.
  if (validation.kind === "bestsellers") {
    const exists = await prisma.homeSection.findFirst({
      where: { tenantId: scope.tenantId, kind: "bestsellers" },
      select: { id: true },
    })
    if (exists) {
      return NextResponse.json(
        { error: "Já existe uma seção “Mais vendidos” — edite a existente" },
        { status: 409 },
      )
    }
  }
  // Para category_courses: bloqueia duplicar a mesma categoria
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
    // Verifica que a categoria existe e tem >=4 cursos ativos (se modo random)
    if (cfg.mode === "random") {
      const courseCount = await prisma.course.count({
        where: { categoryId: cfg.categoryId, status: "ATIVO", hiddenMain: false },
      })
      if (courseCount < 4) {
        return NextResponse.json(
          { error: `Categoria precisa ter pelo menos 4 cursos ativos (encontrado: ${courseCount})` },
          { status: 400 },
        )
      }
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
      enabled: validation.kind === "bestsellers" ? true : true,
      config: validation.config as unknown as Prisma.InputJsonValue,
    },
  })
  return NextResponse.json({ data: created }, { status: 201 })
}

/**
 * PATCH /api/.../home-sections/[id]
 * Body parcial: { config?, enabled?, position? }
 * Regras:
 *  - bestsellers: enabled forçado true (não pode desativar)
 *  - bestsellers: position forçada como mínima entre seções de curso
 *    (sempre antes de category_courses) — aplicado em normalizePositions()
 */
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  const updates: {
    config?: Prisma.InputJsonValue
    enabled?: boolean
    position?: number
  } = {}

  if (b.config !== undefined) {
    const validation = validateSectionPayload(slide.kind, b.config)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    // Em category_courses modo random, valida pelo menos 4 cursos ativos
    if (validation.kind === "category_courses") {
      const cfg = validation.config as Extract<AnySectionConfig, { kind: "category_courses" }>
      if (cfg.mode === "random") {
        const courseCount = await prisma.course.count({
          where: { categoryId: cfg.categoryId, status: "ATIVO", hiddenMain: false },
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
    if (typeof b.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled deve ser boolean" }, { status: 400 })
    }
    updates.enabled = b.enabled
  }

  if (b.position !== undefined) {
    if (typeof b.position !== "number" || !Number.isFinite(b.position) || b.position < 0) {
      return NextResponse.json({ error: "position inválida" }, { status: 400 })
    }
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
  await prisma.homeSection.delete({ where: { id } })
  await normalizePositions(scope)
  return NextResponse.json({ data: { ok: true } })
}

/**
 * Reordena todas as seções do escopo num único PATCH. Body: { order: string[] }
 * (IDs na ordem desejada). bestsellers é forçado para a primeira posição entre
 * seções de curso.
 */
export async function reorderSections(scope: Scope, body: unknown): Promise<Response> {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }
  const { order } = body as Record<string, unknown>
  if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "order deve ser array de IDs" }, { status: 400 })
  }
  const ids = order as string[]
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: scope.tenantId, id: { in: ids } },
    select: { id: true, kind: true },
  })
  if (sections.length !== ids.length) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 })
  }
  // Atualiza positions
  const updates = ids.map((id, idx) =>
    prisma.homeSection.update({ where: { id }, data: { position: idx } }),
  )
  await prisma.$transaction(updates)
  await normalizePositions(scope)
  return NextResponse.json({ data: { ok: true } })
}

/**
 * Garante que bestsellers seja a primeira seção de curso (position mínima
 * entre seções de curso). Também compacta as positions (0..n-1).
 */
async function normalizePositions(scope: Scope) {
  const sections = await prisma.homeSection.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  // Garante bestsellers primeiro entre cursos
  const idxBest = sections.findIndex((s) => s.kind === "bestsellers")
  if (idxBest > 0) {
    const [best] = sections.splice(idxBest, 1)
    sections.unshift(best)
  }
  await prisma.$transaction(
    sections.map((s, i) =>
      prisma.homeSection.update({ where: { id: s.id }, data: { position: i } }),
    ),
  )
}
