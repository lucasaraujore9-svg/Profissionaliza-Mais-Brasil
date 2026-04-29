import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  cookieSecure,
  decodeImpersonationFlag,
  IMPERSONATION_BACKUP_COOKIE,
  IMPERSONATION_FLAG_COOKIE,
  sessionCookieName,
} from "@/lib/auth/impersonate"

export async function POST() {
  const cookieStore = await cookies()
  const flag = decodeImpersonationFlag(
    cookieStore.get(IMPERSONATION_FLAG_COOKIE)?.value,
  )

  if (!flag) {
    return NextResponse.json(
      { error: "Nenhuma impersonação ativa" },
      { status: 400 },
    )
  }

  const backup = cookieStore.get(IMPERSONATION_BACKUP_COOKIE)
  const cookieName = sessionCookieName()
  const secure = cookieSecure()

  if (backup?.value) {
    cookieStore.set({
      name: cookieName,
      value: backup.value,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    })
  } else {
    // Sem backup → derruba sessão e redireciona para login.
    cookieStore.delete(cookieName)
  }

  cookieStore.delete(IMPERSONATION_BACKUP_COOKIE)
  cookieStore.delete(IMPERSONATION_FLAG_COOKIE)

  return NextResponse.json({
    data: { redirect: backup?.value ? "/admin/revendedores" : "/login" },
  })
}
