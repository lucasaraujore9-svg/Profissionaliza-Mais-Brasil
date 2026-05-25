import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listForUser, listForStudent } from "@/lib/notifications"
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

  const items =
    user.role === "STUDENT" && user.studentId
      ? await listForStudent(user.studentId, { onlyUnread, limit })
      : await listForUser(
          {
            userId: user.id,
            role: user.role as never,
            tenantId: user.tenantId ?? null,
          },
          { onlyUnread, limit },
        )

  const unread = items.filter((n) => n.readAt === null).length

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
