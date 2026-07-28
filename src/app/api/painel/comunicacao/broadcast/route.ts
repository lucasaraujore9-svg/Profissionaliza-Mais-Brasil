import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { createNotification } from "@/lib/notifications"
import type { NotificationLevel } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"

const NOTIFICATION_LEVELS: NotificationLevel[] = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
]

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(500).optional().nullable(),
  href: z.string().trim().max(500).optional().nullable(),
  level: z
    .enum(NOTIFICATION_LEVELS as [NotificationLevel, ...NotificationLevel[]])
    .optional(),
  scope: z.enum(["ALL", "ONE"]),
  studentId: z.string().optional(),
})

export const POST = withRequestContext(
  { action: "painel.comunicacao.broadcast", route: "/api/painel/comunicacao/broadcast" },
  async (request: Request) => {
    const guard = await requirePainel("comunicacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      )
    }

    const input = parsed.data
    const baseFields = {
      level: input.level ?? "INFO",
      title: input.title,
      body: input.body || undefined,
      href: input.href || undefined,
      category: "announcement",
    }

    if (input.scope === "ONE") {
      if (!input.studentId) {
        return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 })
      }
      const student = await prisma.student.findFirst({
        where: { id: input.studentId, tenantId: ctx.tenantId },
        select: { id: true },
      })
      if (!student) {
        return NextResponse.json(
          { error: "Aluno não pertence à sua unidade" },
          { status: 404 },
        )
      }
      await createNotification({
        ...baseFields,
        audience: "STUDENT",
        studentId: student.id,
      })
      return NextResponse.json({ data: { delivered: 1 } })
    }

    // ALL alunos do tenant
    const students = await prisma.student.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true },
    })
    const BATCH = 25
    for (let i = 0; i < students.length; i += BATCH) {
      const chunk = students.slice(i, i + BATCH)
      await Promise.all(
        chunk.map((s) =>
          createNotification({
            ...baseFields,
            audience: "STUDENT",
            studentId: s.id,
          }),
        ),
      )
    }
    return NextResponse.json({ data: { delivered: students.length } })
  },
)
