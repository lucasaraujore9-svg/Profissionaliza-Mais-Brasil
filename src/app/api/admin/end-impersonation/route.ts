import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  cookieSecure,
  decodeImpersonationFlag,
  decodeSessionToken,
  IMPERSONATION_BACKUP_COOKIE,
  IMPERSONATION_FLAG_COOKIE,
  sessionCookieName,
} from "@/lib/auth/impersonate"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const POST = withRequestContext(
  { action: "admin.end_impersonation", route: "/api/admin/end-impersonation" },
  async () => {
  const log = contextLogger()
  const cookieStore = await cookies()
  // O flag agora é assinado com HMAC — decodeImpersonationFlag rejeita
  // valores forjados/sem assinatura válida. Antes era base64 puro e qualquer
  // atacante que pudesse setar os dois cookies escalava para admin.
  const flag = decodeImpersonationFlag(
    cookieStore.get(IMPERSONATION_FLAG_COOKIE)?.value,
  )

  if (!flag) {
    log.warn(
      { event: "impersonate.end.invalid_flag" },
      "tentativa de end-impersonation sem flag HMAC válido",
    )
    return NextResponse.json(
      { error: "Nenhuma impersonação ativa" },
      { status: 400 },
    )
  }

  const backup = cookieStore.get(IMPERSONATION_BACKUP_COOKIE)
  const cookieName = sessionCookieName()
  const secure = cookieSecure()

  // Defesa em profundidade: o backup precisa decodificar como JWT NextAuth
  // válido E pertencer ao adminUserId registrado no flag. Isso protege contra
  // backup forjado (mesmo com o flag HMAC válido).
  if (backup?.value) {
    const decoded = await decodeSessionToken(backup.value).catch(() => null)
    if (!decoded || decoded.sub !== flag.adminUserId) {
      log.warn(
        {
          event: "impersonate.end.backup_mismatch",
          flagAdminId: flag.adminUserId,
          backupSub: decoded?.sub ?? null,
        },
        "backup cookie não bate com adminUserId do flag — limpando tudo",
      )
      cookieStore.delete(cookieName)
      cookieStore.delete(IMPERSONATION_BACKUP_COOKIE)
      cookieStore.delete(IMPERSONATION_FLAG_COOKIE)
      return NextResponse.json(
        { error: "Sessão de admin inválida — faça login novamente" },
        { status: 401 },
      )
    }
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

  log.info(
    { event: "impersonate.end", adminUserId: flag.adminUserId, targetUserId: flag.targetUserId },
    "impersonation encerrada",
  )

  return NextResponse.json({
    data: { redirect: backup?.value ? "/admin/revendedores" : "/login" },
  })
  },
)
