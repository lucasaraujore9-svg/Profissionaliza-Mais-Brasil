import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { runBoletoInstallmentSweep } from "@/lib/installments/sweep"
import { runSubscriptionCarneSweep } from "@/lib/subscriptions/carne-sweep"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Cron diário do carnê (venda parcelada no boleto):
 *   - emite os boletos MP cujo vencimento entrou na janela de 7 dias (o MP não
 *     tem carnê nativo — cada boleto é emitido perto do vencimento);
 *   - marca parcelas vencidas como OVERDUE e suspende/bloqueia o aluno;
 *   - cuida da ASSINATURA NO BOLETO (renovação, emissão, atraso, carnê
 *     abandonado) — ver `lib/subscriptions/carne-sweep.ts`. Mora aqui para não
 *     depender de um job novo no pg_cron, que não se agenda sozinho.
 *
 * Idempotente: parcelas já emitidas são puladas; matrículas já suspensas idem.
 * O Asaas gera o carnê nativo na venda, então normalmente não tem nada a emitir
 * aqui — mas a parte de inadimplência vale para os dois gateways.
 */
export const POST = withRequestContext(
  {
    action: "cron.sweep_boleto_installments",
    route: "/api/cron/sweep-boleto-installments",
  },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const log = contextLogger()
    const result = await runBoletoInstallmentSweep()
    // Uma falha no carnê de curso não pode segurar os boletos das assinaturas
    // (nem o contrário): cada varredura responde pelo seu resultado.
    const subscriptions = await runSubscriptionCarneSweep().catch((err) => {
      log.error(
        { err, event: "cron.sweep_boleto_installments.subscriptions_failed" },
        "varredura da assinatura no boleto falhou",
      )
      return null
    })

    log.info(
      { event: "cron.sweep_boleto_installments.done", ...result, subscriptions },
      "cron sweep-boleto-installments concluído",
    )

    if (subscriptions && subscriptions.emitErrors > 0) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Cron carnê: boletos de assinatura não emitidos",
        body: `${subscriptions.emitErrors} boleto(s) de assinatura não puderam ser emitidos nesta rodada. Verifique o endereço/CPF do aluno e a conta de pagamento da unidade.`,
        category: "cron",
        href: "/admin/alunos",
      }).catch(() => undefined)
    }

    if (result.generateErrors > 0) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: "Cron carnê: falhas de emissão de boleto",
        body: `${result.generateErrors} boleto(s) MP não puderam ser emitidos nesta rodada. Verifique o endereço do aluno / a conta MP da unidade.`,
        category: "cron",
        href: "/admin/alunos",
      }).catch(() => undefined)
    }

    return NextResponse.json({ data: { ...result, subscriptions } })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
