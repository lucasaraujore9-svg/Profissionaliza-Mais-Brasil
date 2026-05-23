import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { createNotification } from "@/lib/notifications"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import type { NotificationLevel } from "@prisma/client"

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

export async function POST(request: Request) {
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
    const students = await prisma.student.findMany({
      where: { tenantId: input.tenantId },
      select: { id: true },
    })
    await dispatchToStudents(students, baseFields)
    return NextResponse.json({ data: { delivered: students.length } })
  }

  if (input.scope === "PMB") {
    const pmb = await getOrCreatePmbTenant()
    const students = await prisma.student.findMany({
      where: { tenantId: pmb.id },
      select: { id: true },
    })
    await dispatchToStudents(students, baseFields)
    return NextResponse.json({ data: { delivered: students.length } })
  }

  // ALL
  const students = await prisma.student.findMany({ select: { id: true } })
  await dispatchToStudents(students, baseFields)
  return NextResponse.json({ data: { delivered: students.length } })
}

interface StudentRef {
  id: string
}

interface PayloadFields {
  level: NotificationLevel
  title: string
  body?: string
  href?: string
  category: string
}

async function dispatchToStudents(
  students: StudentRef[],
  fields: PayloadFields,
): Promise<void> {
  const BATCH = 25
  for (let i = 0; i < students.length; i += BATCH) {
    const chunk = students.slice(i, i + BATCH)
    await Promise.all(
      chunk.map((s) =>
        createNotification({
          ...fields,
          audience: "STUDENT",
          studentId: s.id,
        }),
      ),
    )
  }
}
