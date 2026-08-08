import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { blockTenantStudents, unblockTenantStudents } from "@/lib/auto-block"
import { contextLogger } from "@/lib/logger"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  loadTenantLifecycle,
  assertCortesiaExcepcional,
  CORTESIA_AUDIT,
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
} from "@/lib/tenants/lifecycle"

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "CANCELLED"]),
  // Justificativa da cortesia excepcional. Só é lida quando o gate bloqueia e
  // quem chamou tem `unidades.cortesiaExcepcional`.
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(MAX_REASON_LENGTH).optional(),
})

/**
 * Estados que devolvem a unidade ao ar — ou fingem que ela nunca saiu.
 *
 * `PENDING` está aqui junto com `ACTIVE` de propósito. Ele significa "aguardando
 * o primeiro pagamento", que é exatamente a ficção que uma unidade
 * suspensa/cancelada precisa vestir para escapar do gate: `SUSPENDED → PENDING`
 * (o gate não olharia o destino) e depois `PENDING → ACTIVE` (a origem já não é
 * suspensa). Duas chamadas lícitas e a trava nunca dispara. Pior: com a unidade
 * em `PENDING`, a rota de billing ainda promove para `ACTIVE` sozinha ao torná-la
 * gratuita. Por isso o gate olha o estado de ORIGEM, não só o de destino.
 */
const REACTIVATING_STATUSES = ["ACTIVE", "PENDING"] as const

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

  // Cortesia excepcional: unidade que nunca pagou não volta ao ar de graça.
  if ((REACTIVATING_STATUSES as readonly string[]).includes(parsed.data.status)) {
    const lifecycle = await loadTenantLifecycle(id)
    const verdict = assertCortesiaExcepcional({
      tenant: { neverActivated: lifecycle?.neverActivated ?? false },
      trigger: "reactivate",
      override: {
        allowed: ctx.can("unidades.cortesiaExcepcional"),
        reason: parsed.data.reason,
      },
    })

    if (verdict.blocked) {
      // Tentativa negada também entra na trilha: é assim que o dono enxerga
      // quem insiste em reabrir unidade que nunca pagou.
      await logAudit({
        action: CORTESIA_AUDIT.blocked,
        resource: "Tenant",
        resourceId: id,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorEmail: ctx.email,
        tenantId: id,
        payloadBefore: { status: tenant.status },
        payloadAfter: { status: parsed.data.status, trigger: "reactivate" },
      })
      return NextResponse.json(
        { error: verdict.message, requiresReason: verdict.requiresReason },
        { status: 403 },
      )
    }

    if (verdict.overridden) {
      await logAudit({
        action: CORTESIA_AUDIT.granted,
        resource: "Tenant",
        resourceId: id,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorEmail: ctx.email,
        tenantId: id,
        payloadBefore: { status: tenant.status },
        payloadAfter: {
          status: parsed.data.status,
          trigger: "reactivate",
          reason: verdict.reason,
        },
      })
    }
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
