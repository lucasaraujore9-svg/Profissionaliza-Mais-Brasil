import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  /** Liga a cota de aulas para a rede inteira. */
  enabled: z.boolean(),
  /**
   * Corte na plataforma de aulas assim que QUALQUER matrícula bate a cota,
   * mesmo que a pessoa tenha outro curso quitado no mesmo login.
   */
  strict: z.boolean(),
})

/**
 * PUT /api/admin/system-settings/pace-gate
 *
 * Interruptor global da cota de aulas — a trava que impede o aluno de avançar
 * além da fração do curso que já pagou. É uma decisão comercial (quanto de
 * garantia de recebimento a rede quer), então mora em Configurações e não no
 * código.
 *
 * Auditado: ligar ou desligar muda o acesso de todo aluno parcelado da rede de
 * uma vez, e a próxima varredura aplica/solta em massa.
 */
export const PUT = withRequestContext(
  {
    action: "admin.system_settings.pace_gate.update",
    route: "/api/admin/system-settings/pace-gate",
  },
  async (request: Request) => {
    const guard = await requireAdmin("configuracoes.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const before = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { paceGateEnabled: true, paceGateStrict: true },
    })

    const data = {
      paceGateEnabled: parsed.data.enabled,
      paceGateStrict: parsed.data.strict,
    }

    const updated = await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
      select: { paceGateEnabled: true, paceGateStrict: true },
    })

    await logAudit({
      action: "system_settings.pace_gate",
      resource: "SystemSettings",
      resourceId: "default",
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      payloadBefore: {
        paceGateEnabled: before?.paceGateEnabled ?? false,
        paceGateStrict: before?.paceGateStrict ?? false,
      },
      payloadAfter: updated,
    })

    return NextResponse.json({ data: updated })
  },
)
