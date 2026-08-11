import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { isPmbTenantSlug } from "@/lib/checkout/assert-tenant-gateway"
import { lookupCouponForScope } from "@/lib/coupons/lookup"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  courseId: z.string().min(1),
})

/**
 * PRÉVIA de cupom na recompra do aluno logado (/aluno/comprar).
 *
 * A vitrine já tinha isso (`/api/loja/cupom/validar` e a Server Action
 * `previewCheckoutCoupon`), mas nenhuma das duas serve aqui: ambas resolvem o
 * escopo pelo HOST (headers `x-tenant-*` do proxy) e a área do aluno é servida
 * no domínio da PMB mesmo para o aluno de uma unidade — o aluno de revenda
 * cairia no escopo PMB e enxergaria os cupons do sistema mãe.
 *
 * Escopo por IDENTIFICAÇÃO POSITIVA do tenant do aluno (`Student.tenantId` no
 * banco, nunca o claim do JWT) — exatamente o que `/api/aluno/comprar` faz para
 * rotear a cobrança. Assim a prévia e a cobrança concordam sobre QUAL cupom
 * existe e sobre QUAL preço-base ele incide.
 *
 * Só lê: não reserva uso do cupom. A reserva (e a revalidação de tudo) continua
 * em `/api/aluno/comprar`, no momento de criar a matrícula.
 */
export const POST = withRequestContext(
  { action: "aluno.cupom.validar", route: "/api/aluno/cupom/validar" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const rl = await rateLimitByKey(session.studentId, RATE_LIMITS.alunoCupom)
    if (!rl.ok) return rateLimitResponse(rl)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { tenant: { select: { id: true, slug: true } } },
    })
    const tenant = student?.tenant
    if (!tenant) {
      // Student.tenantId é NOT NULL; ausência aqui = aluno inexistente.
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const isPmb = isPmbTenantSlug(tenant.slug)

    // Preço-base: a MESMA fonte que `/api/aluno/comprar` usa em cada ramo. Ler
    // de outro lugar (ou aceitar um valor do client) faria a prévia prometer um
    // total diferente do cobrado.
    let basePrice: number
    if (isPmb) {
      const course = await prisma.course.findFirst({
        where: { id: parsed.data.courseId, status: "ATIVO" },
        select: {
          precoVitrineMain: true,
          precoPromocional: true,
          precoOriginal: true,
        },
      })
      if (!course) {
        return NextResponse.json(
          { error: "Curso indisponível", code: "COURSE_NOT_FOUND" },
          { status: 404 },
        )
      }
      basePrice = Number(
        course.precoVitrineMain ?? course.precoPromocional ?? course.precoOriginal ?? 0,
      )
    } else {
      const tenantCourse = await prisma.tenantCourse.findFirst({
        where: {
          tenantId: tenant.id,
          courseId: parsed.data.courseId,
          isVisible: true,
          price: { gt: 0 },
          course: { status: "ATIVO" },
        },
        select: { price: true },
      })
      if (!tenantCourse) {
        return NextResponse.json(
          { error: "Curso não encontrado", code: "COURSE_NOT_FOUND" },
          { status: 404 },
        )
      }
      basePrice = Number(tenantCourse.price)
    }

    if (basePrice <= 0) {
      return NextResponse.json(
        { error: "Curso sem valor para venda", code: "COURSE_NO_PRICE" },
        { status: 400 },
      )
    }

    // Escopo do cupom espelha o da matrícula que será criada: PMB = tenantId
    // null; revenda = o tenant do aluno.
    const result = await lookupCouponForScope({
      tenantId: isPmb ? null : tenant.id,
      code: parsed.data.code,
      basePrice,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: "COUPON_INVALID" }, { status: 400 })
    }

    return NextResponse.json({ data: { ...result.coupon, basePrice } })
  },
)
