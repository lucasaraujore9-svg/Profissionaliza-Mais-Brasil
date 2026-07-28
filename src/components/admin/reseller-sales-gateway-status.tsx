"use client"

import { AlertTriangle, CheckCircle2, CreditCard, XCircle } from "lucide-react"
import { paymentGatewayLabel } from "@/lib/labels"

/**
 * Status SOMENTE LEITURA do gateway de vendas da unidade.
 *
 * Antes este card era um toggle: o Asaas era capability liberada caso a caso
 * pelo Admin Master (`asaasGatewayEnabled`) e, sem ela, a unidade nem via a
 * opcao no painel. Isso acabou — as duas opcoes (Mercado Pago e Asaas) valem
 * para toda unidade, e conectar/escolher e decisao dela em
 * /painel/configuracoes. Aqui fica so a visibilidade para o suporte.
 *
 * `checkoutMode` vem do helper `tenantCheckoutMode` (mesma fonte da vitrine):
 * exibir so o `salesGateway` cru fazia o card afirmar "Ativo: Mercado Pago"
 * numa unidade sem credencial nenhuma, cujo checkout esta morto.
 */
interface ResellerSalesGatewayStatusProps {
  /** Já informou a API key da própria conta Asaas. */
  asaasConnected: boolean
  /** Gateway ativo da vitrine (MP padrão | ASAAS). */
  salesGateway: "MP" | "ASAAS"
  /** Gateway EFETIVO: "NONE" = a vitrine não consegue cobrar. */
  checkoutMode: "MP" | "ASAAS" | "NONE"
}

export function ResellerSalesGatewayStatus({
  asaasConnected,
  salesGateway,
  checkoutMode,
}: ResellerSalesGatewayStatusProps) {
  const vendendo = checkoutMode !== "NONE"

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Gateway de vendas
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            vendendo
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          Ativo: {paymentGatewayLabel(salesGateway)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Toda unidade pode receber pelo Mercado Pago ou pelo Asaas — as duas
        opções ficam disponíveis no painel dela. A conexão (credenciais + token
        do webhook) e a escolha do gateway ativo são feitas pelo próprio
        revendedor em <strong>/painel/configuracoes</strong>.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Status na unidade
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {asaasConnected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-[var(--color-pmb-green-900)]">
                Conta Asaas conectada
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">
                Conta Asaas ainda não conectada pela unidade
              </span>
            </>
          )}
        </div>
        {!vendendo && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              O gateway ativo não está utilizável — a vitrine desta unidade não
              consegue cobrar e mostra o formulário de contato no lugar do
              checkout. A unidade precisa conectar{" "}
              {salesGateway === "ASAAS" ? "o Asaas" : "o Mercado Pago"} em
              /painel/configuracoes.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
