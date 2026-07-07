"use client"

import { useEffect, useState } from "react"
import { FileText, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface Props {
  tenantId: string
  boletoInstallmentAllowed: boolean
  boletoInstallmentEnabled: boolean
  boletoInstallmentMaxCount: number
  onSaved?: () => void
}

export function ResellerBoletoInstallmentConfig({
  tenantId,
  boletoInstallmentAllowed,
  boletoInstallmentEnabled,
  boletoInstallmentMaxCount,
  onSaved,
}: Props) {
  const [allowed, setAllowed] = useState(boletoInstallmentAllowed)
  const [maxCount, setMaxCount] = useState(boletoInstallmentMaxCount)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAllowed(boletoInstallmentAllowed)
    setMaxCount(boletoInstallmentMaxCount)
  }, [boletoInstallmentAllowed, boletoInstallmentMaxCount])

  const dirty =
    allowed !== boletoInstallmentAllowed ||
    maxCount !== boletoInstallmentMaxCount

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/boleto-installment`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed, maxCount }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(allowed ? "Carnê liberado" : "Carnê bloqueado")
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
          <FileText className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Venda parcelada no boleto (carnê)
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            boletoInstallmentAllowed
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {boletoInstallmentAllowed ? "Liberado" : "Bloqueado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quando liberado, o revendedor pode ativar na venda direta o carnê no
        boleto (Asaas gera o carnê nativo; MP emite um boleto por mês).
        {boletoInstallmentAllowed && (
          <>
            {" "}
            Uso atual pela unidade:{" "}
            <strong className="text-[var(--color-pmb-green-900)]">
              {boletoInstallmentEnabled ? "ativado" : "desativado"}
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
            Permitir carnê no boleto para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Sem isso, a opção não aparece na venda direta do revendedor.
          </p>
        </div>
      </label>

      <div className="mt-4 max-w-xs">
        <label
          htmlFor="boleto-maxcount"
          className="text-[11px] font-semibold uppercase tracking-wide text-gray-500"
        >
          Máximo de parcelas
        </label>
        <input
          id="boleto-maxcount"
          type="number"
          min={2}
          max={24}
          value={maxCount}
          disabled={!allowed}
          onChange={(e) =>
            setMaxCount(Math.max(2, Math.min(24, Number(e.target.value) || 2)))
          }
          className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
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
