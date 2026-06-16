import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { listRevendaLeadAssignees } from "@/lib/automation/assign"

// Quem configura o rodízio: super e gerente de vendas.
const CAN_CONFIG = ["SUPER_ADMIN", "PMB_SALES_MGR"]

// GET — estado atual do rodízio + vendedores de revenda elegíveis.
export async function GET() {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (!CAN_CONFIG.includes(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { leadRevendaAutoAssign: true },
  })
  const assignees = await listRevendaLeadAssignees()

  return NextResponse.json({
    data: {
      autoAssign: settings?.leadRevendaAutoAssign ?? false,
      assignees: assignees.map((a) => ({
        userId: a.userId,
        name: a.name,
        active: a.active,
        pendingInvite: a.pendingInvite,
      })),
    },
  })
}

const schema = z.object({ autoAssign: z.boolean() })

// PUT — liga/desliga o rodízio automático.
export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (!CAN_CONFIG.includes(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: { leadRevendaAutoAssign: parsed.data.autoAssign },
    create: { id: "default", leadRevendaAutoAssign: parsed.data.autoAssign },
  })

  return NextResponse.json({ data: { autoAssign: parsed.data.autoAssign } })
}
