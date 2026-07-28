import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.pacotes.courses_lookup", route: "/api/painel/pacotes/courses-lookup" },
  async () => {
    const guard = await requirePainel("pacotes.manage")
    if (!guard.ok) return guard.response
        const courses = await prisma.course.findMany({
      where: { status: "ATIVO" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    })
    return NextResponse.json({ data: { courses } })
  },
)
