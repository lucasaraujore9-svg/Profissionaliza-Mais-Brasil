import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"

const SETTINGS_ID = "default"

const schema = z.object({
  certificateAutoIssue: z.boolean().optional(),
  certificateMinPercent: z.number().int().min(50).max(100).optional(),
  certificateRequireCpf: z.boolean().optional(),
})

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: {
      certificateAutoIssue: true,
      certificateMinPercent: true,
      certificateRequireCpf: true,
    },
  })

  return NextResponse.json({ data: row })
}

export async function PUT(request: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const updateData: {
    certificateAutoIssue?: boolean
    certificateMinPercent?: number
    certificateRequireCpf?: boolean
  } = {}
  if (parsed.data.certificateAutoIssue !== undefined) {
    updateData.certificateAutoIssue = parsed.data.certificateAutoIssue
  }
  if (parsed.data.certificateMinPercent !== undefined) {
    updateData.certificateMinPercent = parsed.data.certificateMinPercent
  }
  if (parsed.data.certificateRequireCpf !== undefined) {
    updateData.certificateRequireCpf = parsed.data.certificateRequireCpf
  }

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: updateData,
    create: { id: SETTINGS_ID, ...updateData },
    select: {
      certificateAutoIssue: true,
      certificateMinPercent: true,
      certificateRequireCpf: true,
    },
  })

  return NextResponse.json({ data: row })
}
