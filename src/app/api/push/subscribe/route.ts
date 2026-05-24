import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(512).optional(),
})

const deleteSchema = z.object({
  endpoint: z.string().url().max(2048),
})

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

export async function POST(request: Request) {
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

  const parsed = subscribeSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const { endpoint, p256dh, auth: authKey, userAgent } = parsed.data

  // upsert por (target, endpoint). Mesmo endpoint pode pertencer a outro
  // usuario apos logout → deletamos qualquer registro orfao desse endpoint
  // antes de inserir o novo. Tudo em uma transação para evitar race entre
  // delete + upsert quando dois clients diferentes subscrevem o mesmo
  // endpoint simultaneamente.
  const where =
    target.kind === "user"
      ? { userId_endpoint: { userId: target.id, endpoint } }
      : { studentId_endpoint: { studentId: target.id, endpoint } }

  const create =
    target.kind === "user"
      ? {
          userId: target.id,
          endpoint,
          p256dh,
          auth: authKey,
          userAgent: userAgent ?? null,
        }
      : {
          studentId: target.id,
          endpoint,
          p256dh,
          auth: authKey,
          userAgent: userAgent ?? null,
        }

  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        NOT:
          target.kind === "user"
            ? { userId: target.id }
            : { studentId: target.id },
      },
    }),
    prisma.pushSubscription.upsert({
      where,
      update: {
        p256dh,
        auth: authKey,
        userAgent: userAgent ?? null,
        lastUsedAt: new Date(),
        failureCount: 0,
      },
      create,
    }),
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
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

  const parsed = deleteSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint: parsed.data.endpoint,
      ...(target.kind === "user"
        ? { userId: target.id }
        : { studentId: target.id }),
    },
  })

  return NextResponse.json({ ok: true })
}
