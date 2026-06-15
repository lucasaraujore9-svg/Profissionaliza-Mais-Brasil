"use client"

import { useEffect, useState } from "react"
import { CreditCard, Save, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerAsaasGatewayConfigProps {
  tenantId: string
  asaasGatewayEnabled: boolean
  /** Já informou a API key da própria conta Asaas. */
  asaasConnected: boolean
  /** Gateway ativo da vitrine (MP padrão | ASAAS). */
  salesGateway: "MP" | "ASAAS"
  onSaved?: () => void
}

export function ResellerAsaasGatewayConfig({
  tenantId,
  asaasGatewayEnabled,
  asaasConnected,
  salesGateway,
  onSaved,
}: ResellerAsaasGatewayConfigProps) {
  const [enabled, setEnabled] = useState(asaasGatewayEnabled)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(asaasGatewayEnabled)
  }, [asaasGatewayEnabled])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/asaas-gateway`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(enabled ? "Gateway Asaas liberado" : "Gateway Asaas bloqueado")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Gateway Asaas
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            asaasGatewayEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {asaasGatewayEnabled ? "Liberado" : "Bloqueado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quando liberado, a unidade passa a ver no painel (Configurações →
        Pagamento) a opção de conectar a própria conta Asaas e escolhê-la como
        gateway de vendas. Por padrão fica desligado — só aparece para quem você
        liberar aqui.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Liberar gateway Asaas para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Ao bloquear, o gateway ativo volta automaticamente para Mercado Pago.
          </p>
        </div>
      </label>

      {asaasGatewayEnabled && (
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
            <span className="ml-auto text-[11px] font-semibold uppercase text-gray-500">
              Ativo: {salesGateway}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            A conexão (API key + token do webhook) é feita pelo próprio
            revendedor em /painel/configuracoes.
          </p>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || enabled === asaasGatewayEnabled}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
