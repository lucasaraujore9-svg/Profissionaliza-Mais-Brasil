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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const target = await getTarget()
  if (!target) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const { id } = await context.params

  const result = await prisma.pushSubscription.deleteMany({
    where: {
      id,
      ...(target.kind === "user"
        ? { userId: target.id }
        : { studentId: target.id }),
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Dispositivo não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
