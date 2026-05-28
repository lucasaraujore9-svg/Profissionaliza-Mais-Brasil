import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { createNotification } from "@/lib/notifications"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import type { NotificationLevel } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"

/** Permite até 5 min para broadcasts grandes */
export const maxDuration = 300

const NOTIFICATION_LEVELS: NotificationLevel[] = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
]

const baseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(500).optional().nullable(),
  href: z.string().trim().max(500).optional().nullable(),
  level: z
    .enum(NOTIFICATION_LEVELS as [NotificationLevel, ...NotificationLevel[]])
    .optional(),
})

const tenantSchema = baseSchema.extend({
  target: z.literal("TENANT"),
  scope: z.enum(["ALL", "ONE"]),
  tenantId: z.string().optional(),
})

const studentSchema = baseSchema.extend({
  target: z.literal("STUDENT"),
  // ALL = todos do ecossistema · PMB = só alunos da vitrine direta PMB
  // TENANT = todos alunos de uma unidade · ONE = um aluno
  scope: z.enum(["ALL", "PMB", "TENANT", "ONE"]),
  tenantId: z.string().optional(),
  studentId: z.string().optional(),
})

const schema = z.discriminatedUnion("target", [tenantSchema, studentSchema])

export const POST = withRequestContext(
  { action: "admin.notifications.broadcast", route: "/api/admin/notifications/broadcast" },
  async (request: Request) => {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

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

  if (input.target === "TENANT") {
    if (input.scope === "ONE") {
      if (!input.tenantId) {
        return NextResponse.json({ error: "tenantId obrigatório" }, { status: 400 })
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true },
      })
      if (!tenant) {
        return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })
      }
      await createNotification({
        ...baseFields,
        audience: "TENANT",
        tenantId: tenant.id,
      })
      return NextResponse.json({ data: { delivered: 1 } })
    }

    const tenants = await prisma.tenant.findMany({
      where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } },
      select: { id: true },
    })
    await Promise.all(
      tenants.map((t) =>
        createNotification({
          ...baseFields,
          audience: "TENANT",
          tenantId: t.id,
        }),
      ),
    )
    return NextResponse.json({ data: { delivered: tenants.length } })
  }

  // STUDENT
  if (input.scope === "ONE") {
    if (!input.studentId) {
      return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 })
    }
    const student = await prisma.student.findUnique({
      where: { id: input.studentId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    await createNotification({
      ...baseFields,
      audience: "STUDENT",
      studentId: student.id,
    })
    return NextResponse.json({ data: { delivered: 1 } })
  }

  if (input.scope === "TENANT") {
    if (!input.tenantId) {
      return NextResponse.json({ error: "tenantId obrigatório" }, { status: 400 })
    }
    const count = await bulkDispatchToStudents(
      { tenantId: input.tenantId },
      baseFields,
    )
    return NextResponse.json({ data: { delivered: count } })
  }

  if (input.scope === "PMB") {
    const pmb = await getOrCreatePmbTenant()
    const count = await bulkDispatchToStudents({ tenantId: pmb.id }, baseFields)
    return NextResponse.json({ data: { delivered: count } })
  }

  // ALL — busca destinatários em lotes por cursor para evitar OOM
  const count = await bulkDispatchToStudents({}, baseFields)
  return NextResponse.json({ data: { delivered: count } })
  },
)

interface PayloadFields {
  level: NotificationLevel
  title: string
  body?: string
  href?: string
  category: string
}

/**
 * Envia notificação para todos os alunos que correspondem ao where.
 * Pré-carrega o kill-switch global e os overrides de tenant uma única vez
 * (evita N+1), depois insere as notificações em lotes via createMany.
 */
async function bulkDispatchToStudents(
  where: { tenantId?: string },
  fields: PayloadFields,
): Promise<number> {
  const CURSOR_BATCH = 500
  const INSERT_BATCH = 1000

  // Pré-carrega kill-switch global para a categoria (1 query)
  const globalCfg = fields.category
    ? await prisma.notificationCategoryConfig.findUnique({
        where: { target_category: { target: "STUDENT", category: fields.category } },
        select: { enabled: true },
      })
    : null
  if (globalCfg?.enabled === false) return 0

  // Pré-carrega overrides de tenant para a categoria (1 query)
  const tenantOverrides = fields.category
    ? await prisma.tenantNotificationOverride.findMany({
        where: { category: fields.category },
        select: { tenantId: true, enabled: true },
      })
    : []
  const blockedTenants = new Set(
    tenantOverrides.filter((o) => o.enabled === false).map((o) => o.tenantId),
  )

  // Pré-carrega alunos que desativaram in-app para esta categoria, para o
  // envio em massa respeitar a preferência individual igual ao envio único
  // (createNotification). (1 query)
  const optedOutStudents = new Set<string>()
  if (fields.category) {
    const prefs = await prisma.notificationPreference.findMany({
      where: { category: fields.category, inApp: false, studentId: { not: null } },
      select: { studentId: true },
    })
    for (const p of prefs) if (p.studentId) optedOutStudents.add(p.studentId)
  }

  let delivered = 0
  let cursor: string | undefined = undefined

  // Paginação por cursor para não carregar toda a tabela na memória
  while (true) {
    const students: { id: string; tenantId: string | null }[] =
      await prisma.student.findMany({
        where,
        select: { id: true, tenantId: true },
        orderBy: { id: "asc" },
        take: CURSOR_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      })
    if (students.length === 0) break
    cursor = students[students.length - 1].id

    // Filtra alunos cujo tenant tem override desativado ou que silenciaram
    // a categoria individualmente
    const eligible = students.filter(
      (s) =>
        (!s.tenantId || !blockedTenants.has(s.tenantId)) &&
        !optedOutStudents.has(s.id),
    )

    // Insere em sub-lotes para não exceder parâmetros do Postgres
    for (let i = 0; i < eligible.length; i += INSERT_BATCH) {
      const chunk = eligible.slice(i, i + INSERT_BATCH)
      await prisma.notification.createMany({
        data: chunk.map((s) => ({
          audience: "STUDENT" as const,
          studentId: s.id,
          level: fields.level,
          title: fields.title,
          body: fields.body ?? null,
          category: fields.category ?? null,
          href: fields.href ?? null,
        })),
        skipDuplicates: true,
      })
      delivered += chunk.length
    }

    if (students.length < CURSOR_BATCH) break
  }

  return delivered
}
