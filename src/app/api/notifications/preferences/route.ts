import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"

const CATEGORIES = [
  "payment",
  "enrollment",
  "tenant-billing",
  "tenant",
  "sale",
  "lead",
  "support",
] as const

type Category = (typeof CATEGORIES)[number]

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

export const GET = withRequestContext(
  { action: "notifications.preferences.list", route: "/api/notifications/preferences" },
  async (_request: Request) => {
  const target = await getTarget()
  if (!target) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const where =
    target.kind === "student"
      ? { studentId: target.id }
      : { userId: target.id }

  const rows = await prisma.notificationPreference.findMany({ where })
  const byCategory = new Map(rows.map((r) => [r.category, r]))

  return NextResponse.json({
    data: {
      preferences: CATEGORIES.map((c) => ({
        category: c,
        inApp: byCategory.get(c)?.inApp ?? true,
        email: byCategory.get(c)?.email ?? true,
      })),
    },
  })
  },
)

const patchSchema = z.object({
  category: z.enum(CATEGORIES),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
})

export const PATCH = withRequestContext(
  { action: "notifications.preferences.update", route: "/api/notifications/preferences" },
  async (request: Request) => {
  const target = await getTarget()
  if (!target) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const where =
    target.kind === "student"
      ? {
          studentId_category: {
            studentId: target.id,
            category: parsed.data.category,
          },
        }
      : {
          userId_category: {
            userId: target.id,
            category: parsed.data.category,
          },
        }

  const data: { inApp?: boolean; email?: boolean } = {}
  if (parsed.data.inApp !== undefined) data.inApp = parsed.data.inApp
  if (parsed.data.email !== undefined) data.email = parsed.data.email

  const created =
    target.kind === "student"
      ? {
          studentId: target.id,
          category: parsed.data.category as Category,
          inApp: parsed.data.inApp ?? true,
          email: parsed.data.email ?? true,
        }
      : {
          userId: target.id,
          category: parsed.data.category as Category,
          inApp: parsed.data.inApp ?? true,
          email: parsed.data.email ?? true,
        }

  const result = await prisma.notificationPreference.upsert({
    where,
    update: data,
    create: created,
    select: { category: true, inApp: true, email: true },
  })

  return NextResponse.json({ data: result })
  },
)
