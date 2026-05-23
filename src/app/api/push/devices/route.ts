import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface SessionUser {
  id?: string
  role?: string
  studentId?: string | null
}

async function getTarget() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id || !user.role) return null
  if (user.role === "STUDENT" && user.studentId) {
    return { kind: "student" as const, id: user.studentId }
  }
  return { kind: "user" as const, id: user.id }
}

export async function GET() {
  const target = await getTarget()
  if (!target) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const subs = await prisma.pushSubscription.findMany({
    where:
      target.kind === "user"
        ? { userId: target.id }
        : { studentId: target.id },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      endpoint: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      failureCount: true,
    },
  })

  return NextResponse.json({
    data: {
      items: subs.map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        failureCount: s.failureCount,
      })),
    },
  })
}
