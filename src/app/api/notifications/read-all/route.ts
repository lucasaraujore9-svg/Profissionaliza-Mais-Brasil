import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { markAllAsRead } from "@/lib/notifications"

export async function POST() {
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

  const count =
    user.role === "STUDENT" && user.studentId
      ? await markAllAsRead({ kind: "student", studentId: user.studentId })
      : await markAllAsRead({
          kind: "user",
          userId: user.id,
          role: user.role as never,
          tenantId: user.tenantId ?? null,
        })

  return NextResponse.json({ data: { count } })
}
