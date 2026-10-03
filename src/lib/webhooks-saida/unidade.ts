import { prisma } from "@/lib/prisma"
import { appUrl } from "@/lib/tenant/urls"
import { UNIDADE_SELECT, serializarUnidade } from "@/lib/api-parceiros/unidade-payload"
import { emitWebhookEvent } from "./dispatch"
import type { WebhookEvent } from "./core"

/**
 * Eventos de UNIDADE (revenda). Um ponto de chamada por fato de negócio; o
 * payload é montado aqui, num lugar só, para todos os eventos terem o mesmo
 * bloco `unidade`.
 *
 * Mesma fronteira de dados da API de consulta (`unidade-payload.ts`): nada de
 * credencial de gateway, comissão, CPF completo ou dados de aluno.
 */

/** De onde veio o fato — ajuda o integrador a separar automático de manual. */
export type Origem = "asaas" | "manual" | "cron" | "api" | "admin" | "painel" | "cadastro"

/** Mesmo bloco `unidade` do GET /api/v1/unidades/lookup — o integrador trata os dois igual. */
async function unidadeBlock(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: UNIDADE_SELECT })
  return t ? serializarUnidade(t) : null
}

export function emitUnidadeCriada(tenantId: string, origem: Origem): Promise<void> {
  return emitWebhookEvent(
    "unidade.criada",
    async () => {
      const unidade = await unidadeBlock(tenantId)
      return unidade ? { unidade, origem } : null
    },
    tenantId,
  )
}

const STATUS_EVENT: Partial<Record<string, WebhookEvent>> = {
  ACTIVE: "unidade.ativada",
  SUSPENDED: "unidade.suspensa",
  CANCELLED: "unidade.cancelada",
}

/**
 * Chame DEPOIS de gravar o status novo, e só quando ele mudou de fato
 * (`anterior !== novo`): a mesma unidade pode ser suspensa e reativada várias
 * vezes, então aqui não há dedupe — quem garante "uma vez por transição" é o
 * chamador comparar os dois.
 */
export function emitUnidadeStatus(
  tenantId: string,
  anterior: string,
  novo: string,
  origem: Origem,
): Promise<void> {
  const event = STATUS_EVENT[novo]
  if (!event || anterior === novo) return Promise.resolve()
  return emitWebhookEvent(event, async () => {
    const unidade = await unidadeBlock(tenantId)
    return unidade ? { unidade, statusAnterior: anterior, origem } : null
  })
}

type PagamentoEvent =
  | "unidade.pagamento.confirmado"
  | "unidade.pagamento.vencido"
  | "unidade.pagamento.estornado"

/**
 * Mensalidade da unidade. `asaasPaymentId` é a chave do fato: confirmado duas
 * vezes (CONFIRMED + RECEIVED, webhook + reconciliação, webhook + baixa manual)
 * sai uma vez só.
 */
export function emitUnidadePagamento(
  event: PagamentoEvent,
  asaasPaymentId: string,
  origem: Origem,
): Promise<void> {
  return emitWebhookEvent(
    event,
    async () => {
      const p = await prisma.tenantPayment.findUnique({
        where: { asaasPaymentId },
        select: {
          tenantId: true,
          asaasPaymentId: true,
          amount: true,
          status: true,
          billingType: true,
          dueDate: true,
          paidAt: true,
          markedPaidAt: true,
          installmentId: true,
        },
      })
      if (!p) return null
      const unidade = await unidadeBlock(p.tenantId)
      if (!unidade) return null
      return {
        unidade,
        pagamento: {
          cobrancaId: p.asaasPaymentId,
          valor: Number(p.amount),
          status: p.status,
          formaPagamento: p.billingType,
          vencimento: p.dueDate.toISOString().slice(0, 10),
          pagoEm: (p.paidAt ?? p.markedPaidAt)?.toISOString() ?? null,
          // Checkout transparente do PMB — nunca a fatura do Asaas. Mensalidade
          // parcelada no cartão (`ins_`) não tem página: já foi autorizada.
          url: p.installmentId ? null : `${appUrl()}/cobranca/${p.asaasPaymentId}`,
        },
        origem,
      }
    },
    asaasPaymentId,
  )
}
