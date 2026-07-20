import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { monthlyActive } from "@/lib/tenant/monthly-policy"
import {
  APRENDIZADO_MAX_ITEMS,
  APRENDIZADO_MAX_LEN,
} from "@/lib/courses/aprendizado"

async function tenantMonthlyActive(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { monthlyAllowed: true, monthlyEnabled: true, monthlyScope: true },
  })
  return t ? monthlyActive(t) : false
}

const updateSchema = z.object({
  price: z.number().positive("Preço deve ser maior que zero"),
  paymentType: z.enum(["ONE_TIME", "MONTHLY"]),
  customDescription: z.string().trim().max(2000).nullable().optional(),
  customCapaUrl: z.string().url().nullable().optional(),
  customParcelas: z.number().int().min(1).max(24).nullable().optional(),
  // Lista vazia = "voltar ao padrão da PMB" (não existe "esconder a seção").
  customAprendizado: z
    .array(z.string().trim().min(1).max(APRENDIZADO_MAX_LEN))
    .max(APRENDIZADO_MAX_ITEMS)
    .optional(),
  isVisible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  customOrder: z.number().int().min(0).optional(),
})

async function requireOwnCourse(tenantId: string, id: string) {
  const tc = await prisma.tenantCourse.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  return tc !== null
}

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.cursos.get", route: "/api/painel/cursos/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const tc = await prisma.tenantCourse.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        course: true,
        _count: { select: { enrollments: true } },
      },
    })

    if (!tc) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    const monthlyAvailable = await tenantMonthlyActive(ctx.tenantId)

    return NextResponse.json({
      data: {
        id: tc.id,
        courseId: tc.courseId,
        title: tc.course.nome,
        // Se false, o painel mantem o botao "Mensalidade" visivel porem travado.
        monthlyAvailable,
        // Hierarquia: tenant > admin > plataforma bruto
        description:
          tc.customDescription ??
          tc.course.descricaoOverride ??
          tc.course.descricao,
        capaImageUrl:
          tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
        qtdAulas: tc.course.qtdAulas,
        cargaHoraria: tc.course.cargaHoraria,
        price: Number(tc.price),
        parcelas:
          tc.customParcelas ??
          tc.course.parcelasOverride ??
          tc.course.parcelasSugeridas,
        paymentType: tc.paymentType,
        isVisible: tc.isVisible,
        isFeatured: tc.isFeatured,
        customOrder: tc.customOrder,
        customDescription: tc.customDescription,
        customCapaUrl: tc.customCapaUrl,
        customParcelas: tc.customParcelas,
        customAprendizado: tc.customAprendizado,
        // Defaults vindos do catálogo (úteis pro form mostrar "valor padrão")
        defaultCapaUrl: tc.course.capaOverride ?? tc.course.capaImageUrl,
        defaultParcelas:
          tc.course.parcelasOverride ?? tc.course.parcelasSugeridas,
        defaultDescription: tc.course.descricaoOverride ?? tc.course.descricao,
        // Padrão definido pela PMB no catálogo mãe (vazio => texto genérico,
        // que o painel exibe como placeholder).
        defaultAprendizado: tc.course.aprendizado,
        enrollmentsCount: tc._count.enrollments,
      },
    })
  },
)

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "painel.cursos.update", route: "/api/painel/cursos/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    if (!(await requireOwnCourse(ctx.tenantId, id))) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Trava: so permite marcar MONTHLY se a unidade tem parcelado habilitado
    // (admin liberou E revendedor ativou).
    if (
      parsed.data.paymentType === "MONTHLY" &&
      !(await tenantMonthlyActive(ctx.tenantId))
    ) {
      return NextResponse.json(
        {
          error: "Mensalidade não está habilitada para esta unidade.",
          code: "MONTHLY_NOT_ALLOWED",
        },
        { status: 400 },
      )
    }

    const updated = await prisma.tenantCourse.update({
      where: { id },
      data: {
        price: parsed.data.price,
        paymentType: parsed.data.paymentType,
        customDescription: parsed.data.customDescription ?? null,
        ...(parsed.data.customCapaUrl !== undefined && {
          customCapaUrl: parsed.data.customCapaUrl,
        }),
        ...(parsed.data.customParcelas !== undefined && {
          customParcelas: parsed.data.customParcelas,
        }),
        ...(parsed.data.customAprendizado !== undefined && {
          customAprendizado: parsed.data.customAprendizado,
        }),
        ...(parsed.data.isVisible !== undefined && { isVisible: parsed.data.isVisible }),
        ...(parsed.data.isFeatured !== undefined && { isFeatured: parsed.data.isFeatured }),
        ...(parsed.data.customOrder !== undefined && { customOrder: parsed.data.customOrder }),
      },
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        price: Number(updated.price),
        paymentType: updated.paymentType,
        customDescription: updated.customDescription,
        customCapaUrl: updated.customCapaUrl,
        customParcelas: updated.customParcelas,
        customAprendizado: updated.customAprendizado,
        isVisible: updated.isVisible,
        isFeatured: updated.isFeatured,
        customOrder: updated.customOrder,
      },
    })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.cursos.delete", route: "/api/painel/cursos/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    if (!(await requireOwnCourse(ctx.tenantId, id))) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    const enrollments = await prisma.enrollment.count({
      where: { tenantCourseId: id, status: { in: ["ACTIVE", "PENDING"] } },
    })

    if (enrollments > 0) {
      return NextResponse.json(
        {
          error: "Não é possível remover curso com matrículas ativas ou pendentes.",
          code: "HAS_ACTIVE_ENROLLMENTS",
        },
        { status: 409 },
      )
    }

    await prisma.tenantCourse.delete({ where: { id } })

    return NextResponse.json({ data: { ok: true } })
  },
)
