"use client"

import { useEffect, useState } from "react"
import { Zap, Save, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerAutomationConfigProps {
  tenantId: string
  automationEnabled: boolean
  waConnectedPhone: string | null
  waStatus: string
  onSaved?: () => void
}

export function ResellerAutomationConfig({
  tenantId,
  automationEnabled,
  waConnectedPhone,
  waStatus,
  onSaved,
}: ResellerAutomationConfigProps) {
  const [enabled, setEnabled] = useState(automationEnabled)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(automationEnabled)
  }, [automationEnabled])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/automacao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(enabled ? "Automação ativada" : "Automação desativada")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const isConnected = waStatus === "WORKING" && waConnectedPhone

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Automação
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            automationEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {automationEnabled ? "Ativa" : "Desativada"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quando ativada, libera o formulário “Receba mais informações” na página
        de curso da vitrine, o menu Automação (conexão de WhatsApp + templates)
        e o Kanban de Leads no painel do revendedor.
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
            Habilitar Automação para este revendedor
          </p>
          <p className="text-xs text-gray-500">
            Na primeira ativação, criamos automaticamente os templates padrão
            (formulário, abandono, confirmação, boas-vindas).
          </p>
        </div>
      </label>

      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Conexão WhatsApp
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {isConnected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-mono text-[var(--color-pmb-green-900)]">
                {waConnectedPhone}
              </span>
              <span className="ml-auto text-[11px] font-semibold uppercase text-emerald-700">
                Conectado
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">Nenhum número conectado</span>
              <span className="ml-auto text-[11px] font-semibold uppercase text-gray-500">
                {waStatus}
              </span>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          A conexão é feita pelo próprio revendedor em /painel/automacao/conexao.
        </p>
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || enabled === automationEnabled}
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
