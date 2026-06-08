"use client"

import { useEffect, useState } from "react"
import { CreditCard, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export type MonthlyScope = "DIRECT_ONLY" | "DIRECT_AND_VITRINE"

interface ResellerMonthlyConfigProps {
  tenantId: string
  monthlyAllowed: boolean
  monthlyEnabled: boolean
  monthlyScope: MonthlyScope
  onSaved?: () => void
}

export function ResellerMonthlyConfig({
  tenantId,
  monthlyAllowed,
  monthlyEnabled,
  monthlyScope,
  onSaved,
}: ResellerMonthlyConfigProps) {
  const [allowed, setAllowed] = useState(monthlyAllowed)
  const [scope, setScope] = useState<MonthlyScope>(monthlyScope)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAllowed(monthlyAllowed)
    setScope(monthlyScope)
  }, [monthlyAllowed, monthlyScope])

  const dirty = allowed !== monthlyAllowed || scope !== monthlyScope

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/mensalidade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyAllowed: allowed, monthlyScope: scope }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(allowed ? "Parcelado liberado" : "Parcelado bloqueado")
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
            Pagamento parcelado (mensalidade)
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            monthlyAllowed
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {monthlyAllowed ? "Liberado" : "Bloqueado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quando liberado, o revendedor pode ativar a mensalidade em
        Configurações → Pagamento e marcar cursos como parcelado. O escopo abaixo
        define onde o parcelado vale.
        {monthlyAllowed && (
          <>
            {" "}
            Uso atual pelo revendedor:{" "}
            <strong className="text-[var(--color-pmb-green-900)]">
              {monthlyEnabled ? "ativado" : "desativado"}
            </strong>
            .
          </>
        )}
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <input
          type="checkbox"
          checked={allowed}
          onChange={(e) => setAllowed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Permitir pagamento parcelado para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Sem isso, a opção aparece travada no painel do revendedor.
          </p>
        </div>
      </label>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Escopo do parcelado
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setScope("DIRECT_ONLY")}
            disabled={!allowed}
            className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
              scope === "DIRECT_ONLY"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${!allowed ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <div className="font-bold text-[var(--color-pmb-green-900)]">
              Apenas venda direta
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              Só nas vendas criadas pelo revendedor.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScope("DIRECT_AND_VITRINE")}
            disabled={!allowed}
            className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
              scope === "DIRECT_AND_VITRINE"
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${!allowed ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <div className="font-bold text-[var(--color-pmb-green-900)]">
              Venda direta + vitrine
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              Também nas compras self-service do lead.
            </div>
          </button>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || !dirty}
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
