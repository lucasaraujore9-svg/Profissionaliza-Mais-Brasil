import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"
import { requireAdminAny } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.alunos.global.list", route: "/api/admin/alunos/global" },
  async (request: Request) => {
  // Serve duas telas: a lista de alunos da rede e o autocomplete de "emitir
  // certificado". Quem tem `certificados.manage` sem `alunosRede.view` (o
  // gerente de unidades) precisa achar o aluno para emitir — mas so dentro do
  // proprio escopo, aplicado logo abaixo. Sem isto a tela de emissao abria e o
  // primeiro passo do fluxo devolvia 403.
  const guard = await requireAdminAny("alunosRede.view", "certificados.manage")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const tenantFilter = url.searchParams.get("tenant")?.trim() ?? ""

  const where: Prisma.StudentWhereInput = {}

  if (q) {
    const digits = q.replace(/\D/g, "")
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { nome: { contains: q, mode: "insensitive" } },
      // So busca por CPF quando ha digitos, senao `contains: ""` casaria
      // com todos os alunos com CPF.
      ...(digits ? [{ cpf: { contains: digits } }] : []),
    ]
  }

  if (tenantFilter === "__pmb__") {
    where.tenant = { slug: "__pmb__" }
  } else if (tenantFilter && tenantFilter !== "all") {
    where.tenantId = tenantFilter
  }

  // Sem `alunosRede.view`, a busca fica restrita ao escopo da pessoa: as
  // unidades da carteira dela e, se operar a vitrine, os alunos da PMB.
  if (!ctx.can("alunosRede.view")) {
    const unidades = await ctx.unidadesWhere()
    const alcance: Prisma.StudentWhereInput[] = []
    if (unidades) alcance.push({ tenant: unidades })
    if (ctx.can("alunos.view")) alcance.push({ tenant: { slug: "__pmb__" } })
    if (alcance.length === 0) {
      return NextResponse.json({ data: [] })
    }
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: alcance }]
  }

  const students = await prisma.student.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      nome: true,
      email: true,
      fone: true,
      cpf: true,
      status: true,
      plataformaAlunoId: true,
      createdAt: true,
      tenant: { select: { id: true, slug: true, name: true } },
      // Status das matriculas para derivar o status exibido (pago x pendente).
      enrollments: { select: { status: true } },
    },
  })

  // Lista de tenants para popular o filtro do front (com __pmb__ explícito)
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  })

  return NextResponse.json({
    data: {
      students: students.map((s) => {
        const counts = countEnrollmentStatuses(s.enrollments)
        return {
          id: s.id,
          nome: s.nome,
          email: s.email,
          fone: s.fone,
          cpf: s.cpf,
          status: deriveStudentDisplayStatus(s.status, counts),
          plataformaAlunoId: s.plataformaAlunoId,
          createdAt: s.createdAt.toISOString(),
          tenant: {
            id: s.tenant.id,
            slug: s.tenant.slug,
            name:
              s.tenant.slug === "__pmb__"
                ? "Vitrine principal PMB"
                : s.tenant.name,
            isPmbDirect: s.tenant.slug === "__pmb__",
          },
          activeEnrollments: counts.paidEnrollments,
        }
      }),
      tenants: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.slug === "__pmb__" ? "Vitrine principal PMB" : t.name,
      })),
    },
  })
  },
)
