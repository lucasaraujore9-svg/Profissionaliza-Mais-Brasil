"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2,
  Loader2,
  Save,
  XCircle,
  Zap,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface InitialValues {
  pmbAutomationEnabled: boolean
  pmbAbandonedAfterHours: number
  pmbWaStatus: string
  pmbWaConnectedPhone: string | null
}

export function AdminAutomationSettingsForm({
  initial,
}: {
  initial: InitialValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.pmbAutomationEnabled)
  const [hours, setHours] = useState(initial.pmbAbandonedAfterHours)

  const isDirty =
    enabled !== initial.pmbAutomationEnabled ||
    hours !== initial.pmbAbandonedAfterHours

  function submit() {
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      toast.error("Horas para abandono: informe um valor entre 1 e 168")
      return
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/automacao/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pmbAutomationEnabled: enabled,
          pmbAbandonedAfterHours: hours,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(
        enabled
          ? "Automação do site PMB ativada"
          : "Automação do site PMB desativada",
      )
      router.refresh()
    })
  }

  const isConnected =
    initial.pmbWaStatus === "WORKING" && initial.pmbWaConnectedPhone

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-mist)] p-3">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
        <div className="text-xs text-[var(--color-pmb-green-900)]">
          Quando ativada, libera o formulário “Receba mais informações” nas
          páginas de curso do site PMB, o menu Automação (conexão de WhatsApp
          + templates) e o Kanban de Leads no admin. Vale apenas para a
          vitrine institucional — para revendedores, ative em cada um
          individualmente.
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <Switch
          checked={enabled}
          onCheckedChange={(c) => setEnabled(c)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Habilitar Automação para o site PMB
          </p>
          <p className="text-xs text-gray-500">
            Na primeira ativação, os templates padrão (formulário, abandono,
            confirmação, boas-vindas) são criados automaticamente.
          </p>
        </div>
        <span
          className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            initial.pmbAutomationEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {initial.pmbAutomationEnabled ? "Ativa" : "Desativada"}
        </span>
      </label>

      <div className="space-y-2">
        <Label htmlFor="pmb-abandoned-hours">
          Horas até considerar checkout abandonado
        </Label>
        <Input
          id="pmb-abandoned-hours"
          type="number"
          min={1}
          max={168}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="max-w-[160px]"
        />
        <p className="text-xs text-gray-500">
          Entre 1 e 168 horas (7 dias). Leads em CHECKOUT_STARTED há mais
          tempo que isso são movidos para ABANDONED pelo cron diário.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Conexão WhatsApp do site PMB
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {isConnected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-mono text-[var(--color-pmb-green-900)]">
                {initial.pmbWaConnectedPhone}
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
                {initial.pmbWaStatus}
              </span>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          A conexão é feita em{" "}
          <span className="font-mono">/admin/automacao/conexao</span>.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !isDirty}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Salvar
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
