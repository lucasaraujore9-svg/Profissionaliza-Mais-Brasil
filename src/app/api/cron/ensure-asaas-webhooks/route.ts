import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import {
  ensureTenantAsaasWebhook,
  inspectTenantAsaasWebhook,
} from "@/lib/asaas/webhook-provision"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Reconciliação diária do webhook nas contas Asaas das unidades.
 *
 * No Asaas o webhook é da CONTA — `notificationUrl` na cobrança é ignorado —, e
 * enquanto o cadastro dependeu de cada unidade fazê-lo à mão, NENHUMA conta de
 * revenda em produção chegou a notificar: o aluno pagava por PIX/boleto e a
 * matrícula ficava PENDING para sempre. O registro passou a ser automático na
 * conexão da conta, e este cron cobre o resto do ciclo de vida:
 *
 *   - unidades que já estavam conectadas antes do registro automático existir;
 *   - webhook que alguém desativou/apagou no painel do Asaas;
 *   - fila que o Asaas interrompeu ou penalizou depois de uma sequência de
 *     falhas (uma indisponibilidade nossa basta) e que não volta sozinha.
 *
 * Só age quando o estado NÃO está saudável — o `ensure` rotaciona o token, e
 * rotacionar todo dia sem motivo é ruído (e uma janela de falha à toa).
 * Idempotente. Disparado via `app_internal.run_cron('/api/cron/ensure-asaas-webhooks')`.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const tenants = await prisma.tenant.findMany({
    where: { asaasConnected: true, asaasApiKey: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      asaasApiKey: true,
      supportEmail: true,
      salesGateway: true,
      owner: { select: { email: true } },
    },
    orderBy: { slug: "asc" },
  })

  const tally = { scanned: 0, healthy: 0, repaired: 0, created: 0, failed: 0 }
  const failures: Array<{ slug: string; code: string; message: string }> = []

  for (const t of tenants) {
    tally.scanned++
    const target = {
      id: t.id,
      slug: t.slug,
      asaasApiKey: t.asaasApiKey,
      notifyEmail: t.owner?.email ?? t.supportEmail,
    }

    const status = await inspectTenantAsaasWebhook(target)
    if (status.healthy) {
      tally.healthy++
      continue
    }
    // Conta inacessível (chave revogada/sem permissão): tentar o ensure só
    // repetiria o mesmo erro. Registra e segue.
    if (status.unavailable) {
      tally.failed++
      failures.push({
        slug: t.slug,
        code: status.unavailable.code,
        message: status.unavailable.message,
      })
      continue
    }

    const result = await ensureTenantAsaasWebhook(target)
    if (!result.ok) {
      tally.failed++
      failures.push({ slug: t.slug, code: result.code, message: result.message })
      continue
    }
    if (result.created) tally.created++
    else tally.repaired++

    // A unidade precisa saber que ficou um tempo sem confirmação automática —
    // pode haver venda paga esperando o "Verificar pagamento" na ficha do aluno.
    await createNotification({
      audience: "TENANT",
      tenantId: t.id,
      level: "WARNING",
      title: "Confirmação automática de pagamentos foi restabelecida",
      body:
        "O webhook da sua conta Asaas estava fora do ar e foi reconfigurado. " +
        "Se alguma venda desse período aparece como pendente, abra a ficha do " +
        "aluno e use “Verificar pagamento”.",
      category: "payment",
      href: "/painel/configuracoes",
    }).catch(swallow("cron.ensure_asaas_webhooks.notify"))
  }

  // Falha persistente aqui significa unidade vendendo sem confirmar — a PMB
  // precisa saber, porque a unidade sozinha não tem como diagnosticar.
  if (failures.length > 0) {
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "ERROR",
      title: `Webhook Asaas com problema em ${failures.length} unidade(s)`,
      body: failures
        .map((f) => `${f.slug}: ${f.code} — ${f.message}`)
        .join(" | ")
        .slice(0, 900),
      category: "payment",
      href: "/admin/revendedores",
    }).catch(swallow("cron.ensure_asaas_webhooks.alert"))
  }

  contextLogger().info(
    { event: "cron.ensure_asaas_webhooks", ...tally },
    "reconciliação dos webhooks Asaas das unidades concluída",
  )

  return NextResponse.json({ data: { tally, failures } })
}

export async function GET(request: Request) {
  return POST(request)
}
