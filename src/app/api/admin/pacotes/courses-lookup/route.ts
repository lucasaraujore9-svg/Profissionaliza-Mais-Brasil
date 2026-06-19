import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

/* GET — cursos ativos para o multi-select da montagem de pacotes */
export const GET = withRequestContext(
  { action: "admin.pacotes.courses_lookup", route: "/api/admin/pacotes/courses-lookup" },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const courses = await prisma.course.findMany({
      where: { status: "ATIVO" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    })

    return NextResponse.json({ data: { courses } })
  },
)
