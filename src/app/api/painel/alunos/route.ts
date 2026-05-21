import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

export async function GET(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("q")?.trim()
  const statusFilter = searchParams.get("status")?.trim()

  const validStatus = ["ATIVO", "INATIVO", "BLOQUEADO", "DEVEDOR", "FORMADO", "INTERESSADO"]

  const [students, statsRaw] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(search
          ? {
              OR: [
                { nome: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(statusFilter && validStatus.includes(statusFilter)
          ? { status: statusFilter as "ATIVO" | "INATIVO" | "BLOQUEADO" | "DEVEDOR" | "FORMADO" | "INTERESSADO" }
          : {}),
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
}
