import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const revalidate = 60

interface PublicMetrics {
  resellers: number
  courses: number
  students: number
  revenue: number
}

const FALLBACK: PublicMetrics = {
  resellers: 0,
  courses: 0,
  students: 0,
  revenue: 0,
}

export async function GET() {
  try {
    const [resellers, courses, students, revenueAgg] = await Promise.all([
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.course.count(),
      prisma.student.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { mpStatus: "APPROVED" },
      }),
    ])

    const data: PublicMetrics = {
      resellers,
      courses,
      students,
      revenue: Number(revenueAgg._sum.amount ?? 0),
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[metrics/public] error:", error)
    return NextResponse.json({ data: FALLBACK })
  }
}
