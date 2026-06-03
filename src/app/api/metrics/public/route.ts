import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const revalidate = 60

interface PublicMetrics {
  resellers: number
  courses: number
  students: number
}

const FALLBACK: PublicMetrics = {
  resellers: 0,
  courses: 0,
  students: 0,
}

export const GET = withRequestContext(
  { action: "metrics.public", route: "/api/metrics/public" },
  async (_request: Request) => {
  try {
    // Faturamento NÃO é exposto publicamente (dado financeiro sensível).
    const [resellers, courses, students] = await Promise.all([
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.course.count(),
      prisma.student.count(),
    ])

    const data: PublicMetrics = {
      resellers,
      courses,
      students,
    }

    return NextResponse.json({ data })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "metrics.public.failed" },
      "métricas públicas falharam — retornando fallback",
    )
    return NextResponse.json({ data: FALLBACK })
  }
  },
)
