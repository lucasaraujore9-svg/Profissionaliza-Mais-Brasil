import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { markAsRead } from "@/lib/notifications"

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as
    | {
        id?: string
        role?: string
        tenantId?: string | null
        studentId?: string | null
      }
    | undefined
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await ctx.params
  const ok =
    user.role === "STUDENT" && user.studentId
      ? await markAsRead(id, { kind: "student", studentId: user.studentId })
      : await markAsRead(id, {
          kind: "user",
          userId: user.id,
          role: user.role as never,
          tenantId: user.tenantId ?? null,
        })

  if (!ok) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
  return NextResponse.json({ data: { ok: true } })
}
