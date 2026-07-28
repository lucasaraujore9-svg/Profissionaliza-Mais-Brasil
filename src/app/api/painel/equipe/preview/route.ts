import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { requireResellerOwner } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { cookieSecure } from "@/lib/auth/impersonate"
import {
  encodePreview,
  PAINEL_PREVIEW_COOKIE,
  PAINEL_PREVIEW_MAX_AGE,
} from "@/lib/auth/painel-preview"
import { ASSIGNABLE_MEMBER_ROLES } from "@/lib/auth/painel-permissions"

/**
 * Prévia "ver como": o dono inspeciona o painel com as permissões de um papel
 * da equipe. Não emite sessão nova — apenas grava um cookie assinado que
 * `painelContext` usa para trocar o conjunto de permissões por uma versão
 * SOMENTE LEITURA do preset. Owner-only.
 */

const schema = z.object({ role: z.enum(ASSIGNABLE_MEMBER_ROLES) })

async function currentTenantId(): Promise<string | null> {
  const session = await auth()
  const user = session?.user as { tenantId?: string | null } | undefined
  return user?.tenantId ?? null
}

export const POST = withRequestContext(
  { action: "painel.equipe.preview.start", route: "/api/painel/equipe/preview" },
  async (req: Request) => {
    const tenantId = await currentTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
    }
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Papel inválido" }, { status: 400 })
    }

    const response = NextResponse.json({ data: { role: parsed.data.role } })
    response.cookies.set({
      name: PAINEL_PREVIEW_COOKIE,
      value: encodePreview(parsed.data.role, guard.session.userId),
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: PAINEL_PREVIEW_MAX_AGE,
    })
    return response
  },
)

export const DELETE = withRequestContext(
  { action: "painel.equipe.preview.end", route: "/api/painel/equipe/preview" },
  async () => {
    // Sair da prévia só REMOVE um cookie que reduz privilégio — não precisa de
    // guard de dono. Exigi-lo prenderia na prévia um usuário cuja sessão mudou.
    const response = NextResponse.json({ data: { ended: true } })
    response.cookies.set({
      name: PAINEL_PREVIEW_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: 0,
    })
    return response
  },
)
