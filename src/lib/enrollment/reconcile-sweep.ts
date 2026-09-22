import { prisma } from "@/lib/prisma"
import { reconcilePendingEnrollment } from "@/lib/mercadopago/process"
import { contextLogger } from "@/lib/logger"

/**
 * Varredura de vendas PENDENTES contra o gateway (Mercado Pago e Asaas).
 *
 * Rede de seguranca do webhook: se o aviso do gateway nunca chegou, chegou
 * torto ou falhou no processamento, a venda paga ficava PENDING e o aluno sem
 * o curso ate alguem clicar em "verificar pagamento". Aqui cada pendente e
 * conferida no proprio gateway e, se estiver paga, efetivada pelo MESMO
 * `reconcilePendingEnrollment` do botao "ja paguei" — idempotente, entao rodar
 * de novo nao duplica nada.
 *
 * Agendada no pg_cron (`pmb-reconcile-pending-sales`): a cada 3h no horario
 * comercial e a cada 6h fora dele (decisao do dono, 22/09/2026).
 */

/** Janela de busca: checkout abandonado ha mais tempo nao vira pagamento. */
export const RECONCILE_LOOKBACK_DAYS = 30

/** Teto por execucao — uma consulta ao gateway por venda, em serie. */
export const RECONCILE_BATCH = 200

export interface ReconcileSweepResult {
  checked: number
  confirmed: string[]
  pending: number
  unsupported: number
  errors: string[]
}

export async function reconcilePendingSales(
  now: Date = new Date(),
): Promise<ReconcileSweepResult> {
  const since = new Date(now.getTime() - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const pendings = await prisma.enrollment.findMany({
    where: {
      status: "PENDING",
      gateway: { in: ["MP", "ASAAS"] },
      // Satelite de pacote/multi-curso nao tem cobranca propria: quem e
      // conferida e a primaria, e o fulfill dela libera as satelites.
      primaryEnrollmentId: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: RECONCILE_BATCH,
    select: { id: true },
  })

  const result: ReconcileSweepResult = {
    checked: pendings.length,
    confirmed: [],
    pending: 0,
    unsupported: 0,
    errors: [],
  }

  for (const { id } of pendings) {
    try {
      const r = await reconcilePendingEnrollment(id)
      if (r.status === "confirmed") result.confirmed.push(id)
      else if (r.status === "pending") result.pending += 1
      else result.unsupported += 1
    } catch (err) {
      // Uma venda com erro (gateway fora, token revogado) nao para a varredura.
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`${id}: ${message}`)
      contextLogger().warn(
        { err, event: "reconcile_sweep.enrollment_failed", enrollmentId: id },
        "falha ao reconciliar venda pendente",
      )
    }
  }

  return result
}
