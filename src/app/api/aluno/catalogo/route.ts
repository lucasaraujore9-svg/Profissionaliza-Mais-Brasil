import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { COURSE_HAS_PRICE } from "@/lib/catalog/visibility"
import { listTenantCourses } from "@/lib/tenant/courses"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { getSystemSettings } from "@/lib/system-settings"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

interface CatalogCourse {
  id: string
  nome: string
  slug: string
  descricao: string | null
  capa: string | null
  categoria: string | null
  price: number
  installments: number | null
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
  ownedStatus: "PENDING" | "ACTIVE" | "COMPLETED" | null
}

export const GET = withRequestContext(
  { action: "aluno.catalogo.list", route: "/api/aluno/catalogo" },
  async (_request: Request) => {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  // Detecção PMB vs revenda: alunos PMB apontam para o tenant placeholder
  // `__pmb__` (ou JWT legado sem tenantId). Alunos de revenda devem ver o preço
  // da própria unidade (TenantCourse.price), não o preço-base global da PMB.
  const tenant = session.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { slug: true },
      })
    : null
  const isPmb = !session.tenantId || tenant?.slug === PMB_TENANT_SLUG

  const ownedEnrollments = await prisma.enrollment.findMany({
    where: {
      studentId: session.studentId,
      status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
      // Escopa por tenant na revenda para não marcar "já possui" cruzando
      // unidades (na PMB as enrollments têm tenantId=null).
      ...(isPmb ? {} : { tenantId: session.tenantId }),
    },
    select: { courseId: true, status: true },
  })
  // A query já filtra status ∈ {PENDING, ACTIVE, COMPLETED}; estreitamos o tipo
  // para casar com CatalogCourse.ownedStatus (o enum Prisma inclui outros).
  const ownedMap = new Map<string, "PENDING" | "ACTIVE" | "COMPLETED">(
    ownedEnrollments.map((e) => [
      e.courseId,
      e.status as "PENDING" | "ACTIVE" | "COMPLETED",
    ]),
  )

  // ── Revenda: catálogo escopado ao tenant (preço/visibilidade da unidade) ──
  if (!isPmb && session.tenantId) {
    const { items } = await listTenantCourses({
      tenantId: session.tenantId,
      limit: 1000,
    })
    const courses: CatalogCourse[] = items.map((c) => ({
      id: c.courseId,
      nome: c.nome,
      slug: c.slug,
      descricao: c.descricao,
      capa: c.imageUrl,
      categoria: c.categoria,
      price: c.price,
      installments: c.parcelas,
      paymentType: c.paymentType,
      monthlyMonths: c.monthlyMonths,
      ownedStatus: ownedMap.get(c.courseId) ?? null,
    }))
    return NextResponse.json({ data: { courses } })
  }

  // ── PMB (vitrine principal): catálogo global com preço-base PMB ──
  // Pagamento único: "Nx sem juros" vem do nº GLOBAL da PMB (SystemSettings).
  const pmbInterestFree = (await getSystemSettings()).pmbInterestFreeInstallments
  const courses = await prisma.course.findMany({
    where: { status: "ATIVO", hiddenMain: false, AND: [COURSE_HAS_PRICE] },
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
  })

  return NextResponse.json({
    data: {
      courses: courses.map((c): CatalogCourse => {
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
          installments:
            c.paymentTypeMain === "MONTHLY"
              ? null
              : displayInterestFreeInstallments(pmbInterestFree),
          paymentType: c.paymentTypeMain,
          monthlyMonths: c.monthlyMonthsMain,
          ownedStatus: ownedMap.get(c.id) ?? null,
        }
      }),
    },
  })
  },
)
