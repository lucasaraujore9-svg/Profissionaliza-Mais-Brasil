import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { canHandleRevendaLeads, leadScopeWhere } from "@/lib/auth/scope"

const schema = z
  .object({
    status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]).optional(),
    columnOrder: z.number().int().nonnegative().optional(),
    // Reatribuicao de dono. `null` = remover dono. So SUPER_ADMIN / gerente de
    // vendas podem reatribuir (validado abaixo).
    ownerUserId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" })

// Papeis que podem reatribuir o dono de um lead.
const CAN_REASSIGN = ["SUPER_ADMIN", "PMB_SALES_MGR"]

// Atualiza um Lead de revenda (funil B2B): status (kanban), columnOrder
// (reordenacao) e ownerUserId (reatribuicao). Escopo por papel: vendedor de
// revenda so mexe nos seus; gerente de vendas no time; super em todos.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (!canHandleRevendaLeads(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  // Reatribuicao de dono e restrita a super/gerente de vendas.
  if (parsed.data.ownerUserId !== undefined && !CAN_REASSIGN.includes(session.role)) {
    return NextResponse.json(
      { error: "Sem permissão para reatribuir o lead" },
      { status: 403 },
    )
  }

  // Garante que o lead esta no escopo do ator antes de qualquer mudanca.
  const scope = await leadScopeWhere(session)
  if (!scope) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const lead = await prisma.lead.findFirst({
    where: { id, ...scope },
    select: { id: true },
  })
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
  }

  // Se for reatribuir, valida que o novo dono e um vendedor de revenda.
  if (parsed.data.ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: { id: parsed.data.ownerUserId, role: "PMB_REVENDA_SALES" },
      select: { id: true },
    })
    if (!owner) {
      return NextResponse.json(
        { error: "Dono inválido (não é vendedor de revenda)" },
        { status: 400 },
      )
    }
  }

  await prisma.lead.update({
    where: { id },
    data: {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.columnOrder !== undefined
        ? { columnOrder: parsed.data.columnOrder }
        : {}),
      ...(parsed.data.ownerUserId !== undefined
        ? { ownerUserId: parsed.data.ownerUserId }
        : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
