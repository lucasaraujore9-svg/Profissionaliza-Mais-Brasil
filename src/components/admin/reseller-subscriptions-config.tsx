"use client"

import { useEffect, useState } from "react"
import { Sparkles, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerSubscriptionsConfigProps {
  tenantId: string
  subscriptionsEnabled: boolean
  /** Gateway EFETIVO da vitrine: "NONE" = ela não consegue cobrar. */
  checkoutMode: "MP" | "ASAAS" | "NONE"
  /** `unidades.governanca` — a mesma permissão que a rota exige. */
  canEdit: boolean
  onSaved?: () => void
}

/**
 * Liga/desliga o módulo "Vender assinaturas" da unidade — os planos de
 * assinatura (dela e da PMB) na vitrine e na venda direta.
 *
 * É habilitação COMERCIAL, por unidade. A permissão `assinaturas.*` é outra
 * coisa: diz QUEM, dentro da unidade, mexe nos planos depois de ligado — e o
 * preset do dono é acesso total, então sem esta chave toda revenda venderia
 * assinatura. Só `unidades.governanca`; quem não a tem vê o estado sem o
 * controle, em vez de um botão que responde 403.
 */
export function ResellerSubscriptionsConfig({
  tenantId,
  subscriptionsEnabled,
  checkoutMode,
  canEdit,
  onSaved,
}: ResellerSubscriptionsConfigProps) {
  const [enabled, setEnabled] = useState(subscriptionsEnabled)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(subscriptionsEnabled)
  }, [subscriptionsEnabled])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/assinaturas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(
        enabled ? "Venda de assinaturas liberada" : "Venda de assinaturas desativada",
      )
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
          <Sparkles className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Vender assinaturas
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            subscriptionsEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {subscriptionsEnabled ? "Ativo" : "Desativado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Permite que esta unidade venda planos de assinatura — mensal,
        trimestral, semestral, anual ou vitalício — na vitrine e na venda
        direta, com os planos da PMB e os que ela mesma montar.
      </p>

      <label
        className={`mt-5 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition ${
          canEdit ? "cursor-pointer hover:border-[var(--color-pmb-green)]" : "cursor-not-allowed opacity-70"
        }`}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Habilitar venda de assinaturas para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Mostra a aba “Assinaturas” em Catálogo, no painel da unidade, e os
            planos na vitrine e na venda direta.
          </p>
        </div>
      </label>

      {enabled && checkoutMode === "NONE" && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Esta unidade ainda não tem gateway de pagamento conectado. Os planos
          aparecem na vitrine, mas a contratação só conclui depois que ela
          conectar o Mercado Pago ou o Asaas.
        </p>
      )}

      {enabled && checkoutMode === "MP" && (
        <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Esta unidade cobra pelo Mercado Pago: lá a assinatura recorrente é só
          no cartão de crédito (PIX e boleto ficam para o plano vitalício). No
          Asaas, os três meios valem para todas as periodicidades.
        </p>
      )}

      {subscriptionsEnabled && !enabled && (
        <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Desativar tira os planos da vitrine e da venda direta. Quem já assina
          continua com acesso e com a cobrança recorrente. Os planos que a
          unidade montou ficam guardados e voltam se o módulo for religado.
        </p>
      )}

      {canEdit ? (
        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            type="button"
            onClick={save}
            disabled={saving || enabled === subscriptionsEnabled}
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
      ) : (
        <p className="mt-4 text-xs text-gray-500">
          Somente leitura: habilitar módulos exige a permissão de governança de
          unidades.
        </p>
      )}
    </div>
  )
}
