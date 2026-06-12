import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrentTenant } from "@/lib/tenant/current"
import { withRequestContext } from "@/lib/observability/with-request-context"

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

type Target =
  | { kind: "user"; id: string }
  | { kind: "student"; id: string }
  | { kind: "anonymous" }

async function getTarget(): Promise<Target> {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id || !user.role) return { kind: "anonymous" }
  if (user.role === "STUDENT" && user.studentId) {
    return { kind: "student", id: user.studentId }
  }
  return { kind: "user", id: user.id }
}

async function currentTenantId(): Promise<string | null> {
  const tenant = await getCurrentTenant()
  return tenant?.id ?? null
}

export const POST = withRequestContext(
  { action: "push.subscribe", route: "/api/push/subscribe" },
  async (request: Request) => {
    const target = await getTarget()

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
    const tenantId = await currentTenantId()

    // -------------------------------------------------------------------
    // Visitante anônimo: não há (user_id|student_id, endpoint) único quando
    // ambos são NULL (no Postgres NULLs são distintos), então deduplicamos
    // pelo endpoint — que é único por navegador+VAPID. Se já existir uma row
    // para este endpoint (anônima ou de um usuário), apenas atualizamos as
    // chaves; não criamos duplicata nem mexemos na propriedade existente.
    // -------------------------------------------------------------------
    if (target.kind === "anonymous") {
      const existing = await prisma.pushSubscription.findFirst({
        where: { endpoint },
        select: { id: true, tenantId: true },
      })

      if (existing) {
        await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: {
            p256dh,
            auth: authKey,
            userAgent: userAgent ?? null,
            lastUsedAt: new Date(),
            failureCount: 0,
            // só preenche o tenant se ainda não tiver um (não sobrescreve
            // uma assinatura já vinculada a outra unidade).
            ...(existing.tenantId ? {} : { tenantId }),
          },
        })
      } else {
        await prisma.pushSubscription.create({
          data: {
            userId: null,
            studentId: null,
            tenantId,
            endpoint,
            p256dh,
            auth: authKey,
            userAgent: userAgent ?? null,
          },
        })
      }

      return NextResponse.json({ ok: true })
    }

    // -------------------------------------------------------------------
    // Usuário/aluno logado: upsert por (target, endpoint). Mesmo endpoint pode
    // pertencer a outro usuário após logout → deletamos qualquer registro órfão
    // desse endpoint antes de inserir o novo. Tudo em uma transação para evitar
    // race entre delete + upsert quando dois clients diferentes subscrevem o
    // mesmo endpoint simultaneamente.
    // -------------------------------------------------------------------
    const where =
      target.kind === "user"
        ? { userId_endpoint: { userId: target.id, endpoint } }
        : { studentId_endpoint: { studentId: target.id, endpoint } }

    const create =
      target.kind === "user"
        ? {
            userId: target.id,
            tenantId,
            endpoint,
            p256dh,
            auth: authKey,
            userAgent: userAgent ?? null,
          }
        : {
            studentId: target.id,
            tenantId,
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
          ...(tenantId ? { tenantId } : {}),
        },
        create,
      }),
    ])

    return NextResponse.json({ ok: true })
  },
)

export const DELETE = withRequestContext(
  { action: "push.unsubscribe", route: "/api/push/subscribe" },
  async (request: Request) => {
    const target = await getTarget()

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

    // Anônimo só pode remover a row anônima (sem dono) daquele endpoint.
    const ownerFilter =
      target.kind === "user"
        ? { userId: target.id }
        : target.kind === "student"
          ? { studentId: target.id }
          : { userId: null, studentId: null }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: parsed.data.endpoint,
        ...ownerFilter,
      },
    })

    return NextResponse.json({ ok: true })
  },
)
