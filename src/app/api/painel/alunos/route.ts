import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.alunos.list", route: "/api/painel/alunos" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("q")?.trim()
    const statusFilter = searchParams.get("status")?.trim()
    const enrollmentFilter = searchParams.get("enrollment")?.trim()

    const validStatus = ["ATIVO", "INATIVO", "BLOQUEADO", "DEVEDOR", "FORMADO", "INTERESSADO"]

    // Filtro por situacao de matricula/pagamento. "Com curso"/"sem curso"
    // usam matriculas ativas/concluidas (mesma definicao de coursesCount).
    let enrollmentWhere: Prisma.StudentWhereInput = {}
    switch (enrollmentFilter) {
      case "com_curso":
        enrollmentWhere = {
          enrollments: { some: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        }
        break
      case "sem_curso":
        enrollmentWhere = {
          enrollments: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        }
        break
      case "pagamento_pendente":
        enrollmentWhere = { enrollments: { some: { status: "PENDING" } } }
        break
      case "curso_finalizado":
        enrollmentWhere = { enrollments: { some: { status: "COMPLETED" } } }
        break
    }

    const [students, statsRaw] = await Promise.all([
      prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(search
            ? {
                OR: [
                  { nome: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  // So adiciona busca por CPF quando ha digitos, senao
                  // `contains: ""` casaria com todos os alunos com CPF.
                  ...(search.replace(/\D/g, "")
                    ? [{ cpf: { contains: search.replace(/\D/g, "") } }]
                    : []),
                ],
              }
            : {}),
          ...(statusFilter && validStatus.includes(statusFilter)
            ? { status: statusFilter as "ATIVO" | "INATIVO" | "BLOQUEADO" | "DEVEDOR" | "FORMADO" | "INTERESSADO" }
            : {}),
          ...enrollmentWhere,
        },
        include: {
          _count: {
            select: {
              enrollments: {
                where: { status: { in: ["ACTIVE", "COMPLETED"] } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.student.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId },
        _count: { _all: true },
      }),
    ])

    const stats = {
      total: statsRaw.reduce((sum, row) => sum + row._count._all, 0),
      ATIVO: 0,
      INATIVO: 0,
      BLOQUEADO: 0,
      DEVEDOR: 0,
      FORMADO: 0,
      INTERESSADO: 0,
    }
    for (const row of statsRaw) {
      stats[row.status] = row._count._all
    }

    return NextResponse.json({
      data: {
        students: students.map((s) => ({
          id: s.id,
          nome: s.nome,
          email: s.email,
          cpf: s.cpf,
          fone: s.fone,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          coursesCount: s._count.enrollments,
          plataformaAlunoId: s.plataformaAlunoId,
        })),
        stats,
      },
    })
  },
)
