import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const SETTINGS_ID = "default"

const schema = z.object({
  certificateAutoIssue: z.boolean().optional(),
  certificateMinPercent: z.number().int().min(50).max(100).optional(),
  certificateRequireCpf: z.boolean().optional(),
  groupLogoUrl: z.string().url().nullable().optional(),
  groupName: z.string().trim().min(1).max(160).optional(),
})

const SELECT = {
  certificateAutoIssue: true,
  certificateMinPercent: true,
  certificateRequireCpf: true,
  groupLogoUrl: true,
  groupName: true,
} as const

export const GET = withRequestContext(
  { action: "admin.system_settings.certificates.get", route: "/api/admin/system-settings/certificates" },
  async () => {
  const guard = await requireAdmin("certificados.template")
  if (!guard.ok) return guard.response

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: SELECT,
  })

  return NextResponse.json({ data: row })
  },
)

export const PUT = withRequestContext(
  { action: "admin.system_settings.certificates.update", route: "/api/admin/system-settings/certificates" },
  async (request: Request) => {
  const guard = await requireAdmin("certificados.template")
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
    groupLogoUrl?: string | null
    groupName?: string
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
  if (parsed.data.groupLogoUrl !== undefined) {
    updateData.groupLogoUrl = parsed.data.groupLogoUrl
  }
  if (parsed.data.groupName !== undefined) {
    updateData.groupName = parsed.data.groupName
  }

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: updateData,
    create: { id: SETTINGS_ID, ...updateData },
    select: SELECT,
  })

  return NextResponse.json({ data: row })
  },
)
