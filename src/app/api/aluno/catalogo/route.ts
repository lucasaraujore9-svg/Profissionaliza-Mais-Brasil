import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "aluno.catalogo.list", route: "/api/aluno/catalogo" },
  async (_request: Request) => {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const [courses, ownedEnrollments] = await Promise.all([
    prisma.course.findMany({
      where: { status: "ATIVO", hiddenMain: false },
      orderBy: [{ destaqueHome: "desc" }, { ordemHome: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        slug: true,
        descricao: true,
        descricaoOverride: true,
        capaImageUrl: true,
        capaOverride: true,
        categoriaLoja: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        parcelasOverride: true,
        parcelasSugeridas: true,
        paymentTypeMain: true,
        monthlyMonthsMain: true,
      },
    }),
    prisma.enrollment.findMany({
      where: {
        studentId: session.studentId,
        status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      },
      select: { courseId: true, status: true },
    }),
  ])

  const ownedMap = new Map(ownedEnrollments.map((e) => [e.courseId, e.status]))

  return NextResponse.json({
    data: {
      courses: courses.map((c) => {
        const price = Number(
          c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0,
        )
        return {
          id: c.id,
          nome: c.nome,
          slug: c.slug,
          descricao: c.descricaoOverride ?? c.descricao ?? null,
          capa: c.capaOverride ?? c.capaImageUrl ?? null,
          categoria: c.categoriaLoja ?? null,
          price,
          installments: c.parcelasOverride ?? c.parcelasSugeridas ?? null,
          paymentType: c.paymentTypeMain,
          monthlyMonths: c.monthlyMonthsMain,
          ownedStatus: ownedMap.get(c.id) ?? null,
        }
      }),
    },
  })
  },
)
