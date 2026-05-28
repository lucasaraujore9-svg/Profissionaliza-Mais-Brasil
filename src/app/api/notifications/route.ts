import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  listForUser,
  listForStudent,
  countUnreadForUser,
  countUnreadForStudent,
} from "@/lib/notifications"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "notifications.list", route: "/api/notifications" },
  async (request: Request) => {
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

  const url = new URL(request.url)
  const onlyUnread = url.searchParams.get("unread") === "1"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200)

  const isStudent = user.role === "STUDENT" && Boolean(user.studentId)
  const userScope = {
    userId: user.id,
    role: user.role as never,
    tenantId: user.tenantId ?? null,
  }

  // Contagem real de nao-lidas (independente do `limit` da pagina) em paralelo
  // com a busca dos itens. Sem isso o badge ficaria limitado ao tamanho do lote.
  const [items, unread] = await Promise.all([
    isStudent
      ? listForStudent(user.studentId!, { onlyUnread, limit })
      : listForUser(userScope, { onlyUnread, limit }),
    isStudent
      ? countUnreadForStudent(user.studentId!)
      : countUnreadForUser(userScope),
  ])

  return NextResponse.json({
    data: {
      unreadCount: unread,
      items: items.map((n) => ({
        id: n.id,
        level: n.level,
        title: n.title,
        body: n.body,
        category: n.category,
        href: n.href,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    },
  })
  },
)
