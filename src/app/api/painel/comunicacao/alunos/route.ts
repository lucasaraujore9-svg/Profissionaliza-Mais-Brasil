import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.comunicacao.alunos.list", route: "/api/painel/comunicacao/alunos" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")?.trim() ?? ""

    const where: Prisma.StudentWhereInput = { tenantId: ctx.tenantId }
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q.replace(/\D/g, "") } },
      ]
    }

    const students = await prisma.student.findMany({
      where,
      orderBy: { nome: "asc" },
      take: 50,
      select: { id: true, nome: true, email: true },
    })

    return NextResponse.json({
      data: {
        items: students.map((s) => ({ id: s.id, nome: s.nome, email: s.email })),
      },
    })
  },
)
