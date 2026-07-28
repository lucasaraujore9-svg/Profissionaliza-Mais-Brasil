import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z
  .object({
    status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]).optional(),
    columnOrder: z.number().int().nonnegative().optional(),
    // Reatribuicao de dono. `null` = remover dono. Exige `leadsRevenda.config`
    // — a mesma permissao do rodizio, que e quem decide de quem e o lead.
    ownerUserId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar" })

// Atualiza um Lead de revenda (funil B2B): status (kanban), columnOrder
// (reordenacao) e ownerUserId (reatribuicao). Escopo por papel: vendedor de
// revenda so mexe nos seus; gerente de vendas no time; super em todos.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin("leadsRevenda.manage")
  if (!guard.ok) return guard.response

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

  // Reatribuir o dono e decidir a carteira do time — mesma permissao do rodizio.
  if (parsed.data.ownerUserId !== undefined && !guard.ctx.can("leadsRevenda.config")) {
    return NextResponse.json(
      { error: "Sem permissão para reatribuir o lead" },
      { status: 403 },
    )
  }

  // Garante que o lead esta no escopo do ator antes de qualquer mudanca.
  const scope = await guard.ctx.leadsRevendaWhere()
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
