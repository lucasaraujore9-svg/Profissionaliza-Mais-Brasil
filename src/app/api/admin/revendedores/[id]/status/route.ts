import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
import { contextLogger } from "@/lib/logger"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "CANCELLED"]),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.status.update", route: "/api/admin/revendedores/[id]/status" },
  async (request: Request, { params }) => {
  const guard = await requireAdmin("unidades.manage")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, customDomain: true, accountManagerId: true, salesUserId: true, status: true },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // Quem não vê a rede inteira só alcança a própria carteira.
  if (!(await ctx.canAccessTenant(tenant))) {
    return NextResponse.json({ error: "Sem permissão para este revendedor" }, { status: 403 })
  }

  await prisma.tenant.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  await invalidateTenant(tenant)

  // Reativar a unidade TEM que devolver o acesso dos alunos que foram bloqueados
  // enquanto ela estava suspensa. Sem isto eles ficam órfãos: o cron
  // `reactivate-paid` só varre tenants SUSPENDED, então assim que o status vira
  // ACTIVE na mão a unidade sai do radar dele e ninguém mais desbloqueia
  // ninguém — alunos em dia (inclusive bolsistas) seguem sem aula por tempo
  // indeterminado. Foi o que aconteceu com `profissionalizantes` em 21/07/2026.
  //
  // Idempotente: `unblockTenantStudents` só toca em quem está BLOQUEADO. Não
  // reabre quem foi travado pela COTA DE AULAS (status DEVEDOR), que tem dono
  // próprio.
  let studentsUnblocked = 0
  if (parsed.data.status === "ACTIVE" && tenant.status !== "ACTIVE") {
    const unblock = await unblockTenantStudents(id)
    studentsUnblocked = unblock.affectedStudents
    if (unblock.errors.length > 0) {
      contextLogger().error(
        {
          event: "admin.revendedores.status.unblock_partial",
          tenantId: id,
          errors: unblock.errors.length,
        },
        "unidade reativada mas nem todos os alunos foram desbloqueados",
      )
    }
  }

  // Suspender a unidade CORTA o acesso dos alunos dela. O card sempre prometeu
  // isso ("Suspenda ou reative o acesso da unidade"), mas a rota só trocava o
  // status: a loja saía do ar e os alunos continuavam assistindo. O admin
  // suspendia acreditando ter cortado o acesso — e não tinha.
  //
  // Mesmo primitivo do auto-block por inadimplência (src/lib/auto-block.ts), e
  // vale para qualquer `billingMode`: aqui a suspensão é um ato DELIBERADO do
  // admin, não uma inferência de cobrança.
  let studentsBlocked = 0
  if (parsed.data.status === "SUSPENDED" && tenant.status !== "SUSPENDED") {
    const block = await blockTenantStudents(id)
    studentsBlocked = block.affectedStudents
    if (block.errors.length > 0) {
      contextLogger().error(
        {
          event: "admin.revendedores.status.block_partial",
          tenantId: id,
          errors: block.errors.length,
        },
        "unidade suspensa mas nem todos os alunos foram bloqueados",
      )
    }
  }

  // SAAS-001: trilha de auditoria da transição manual de lifecycle do tenant.
  await logAudit({
    action: "tenant.status.update",
    resource: "Tenant",
    resourceId: id,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    tenantId: id,
    payloadBefore: { status: tenant.status },
    payloadAfter: { status: parsed.data.status, studentsUnblocked, studentsBlocked },
  })

  return NextResponse.json({
    data: { status: parsed.data.status, studentsUnblocked, studentsBlocked },
  })
  },
)
