"use client"

import { useEffect, useState } from "react"
import { Store, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerCanSellConfigProps {
  tenantId: string
  canSellResellers: boolean
  onSaved?: () => void
}

/**
 * Liga/desliga o módulo "Revender revendas" da unidade. Quando ligado, a unidade
 * ganha o menu /painel/revendas e pode cadastrar sub-revendas — cobradas no
 * Asaas da PMB e atreladas a ela (ganha comissão de indicação). Só SUPER_ADMIN.
 */
export function ResellerCanSellConfig({
  tenantId,
  canSellResellers,
  onSaved,
}: ResellerCanSellConfigProps) {
  const [enabled, setEnabled] = useState(canSellResellers)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(canSellResellers)
  }, [canSellResellers])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/can-sell-resellers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(enabled ? "Revenda de revendas ativada" : "Revenda de revendas desativada")
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
          <Store className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Revender revendas
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            canSellResellers
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {canSellResellers ? "Ativo" : "Desativado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Permite que esta unidade venda revendas para outras pessoas. As novas
        revendas são cobradas no Asaas da PMB e ficam atreladas a esta unidade
        (que ganha comissão de indicação e pode dar suporte/impersonar).
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
            Habilitar venda de revendas para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Mostra o menu “Revendas” no painel da unidade.
          </p>
        </div>
      </label>

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving}
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
