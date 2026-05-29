import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePmbTeam } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.alunos.global.list", route: "/api/admin/alunos/global" },
  async (request: Request) => {
  const guard = await requirePmbTeam()
  if (!guard.ok) return guard.response

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
      _count: {
        select: {
          enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        },
      },
    },
  })

  // Lista de tenants para popular o filtro do front (com __pmb__ explícito)
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  })

  return NextResponse.json({
    data: {
      students: students.map((s) => ({
        id: s.id,
        nome: s.nome,
        email: s.email,
        fone: s.fone,
        cpf: s.cpf,
        status: s.status,
        plataformaAlunoId: s.plataformaAlunoId,
        createdAt: s.createdAt.toISOString(),
        tenant: {
          id: s.tenant.id,
          slug: s.tenant.slug,
          name:
            s.tenant.slug === "__pmb__" ? "Vitrine principal PMB" : s.tenant.name,
          isPmbDirect: s.tenant.slug === "__pmb__",
        },
        activeEnrollments: s._count.enrollments,
      })),
      tenants: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.slug === "__pmb__" ? "Vitrine principal PMB" : t.name,
      })),
    },
  })
  },
)
