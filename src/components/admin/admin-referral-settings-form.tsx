"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface InitialValues {
  referralEnabled: boolean
  defaultReferralPercent: number
  referralMinPayout: number
  referralPayoutDay: number
}

export function AdminReferralSettingsForm({
  initial,
}: {
  initial: InitialValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<InitialValues>(initial)

  function submit() {
    if (
      form.defaultReferralPercent < 0 ||
      form.defaultReferralPercent > 100
    ) {
      toast.error("O percentual deve estar entre 0 e 100")
      return
    }
    if (form.referralMinPayout < 0) {
      toast.error("Saque minimo invalido")
      return
    }
    if (form.referralPayoutDay < 1 || form.referralPayoutDay > 28) {
      toast.error("Dia do payout deve estar entre 1 e 28")
      return
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/system-settings/referrals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success("Configuracoes atualizadas")
      router.refresh()
    })
  }

  return (
    <Card className="p-6 space-y-5 max-w-xl">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.referralEnabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, referralEnabled: e.target.checked }))
            }
          />
          Programa de indicacao ativo
        </Label>
        <p className="text-xs text-gray-500">
          Quando desativado, novas comissoes deixam de ser geradas.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Percentual padrao (%)</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={form.defaultReferralPercent}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              defaultReferralPercent: Number(e.target.value),
            }))
          }
        />
        <p className="text-xs text-gray-500">
          Aplicado aos tenants sem override individual.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Valor minimo de saque (R$)</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={form.referralMinPayout}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              referralMinPayout: Number(e.target.value),
            }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Dia do payout mensal (1-28)</Label>
        <Input
          type="number"
          min={1}
          max={28}
          value={form.referralPayoutDay}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              referralPayoutDay: Number(e.target.value),
            }))
          }
        />
        <p className="text-xs text-gray-500">
          Comissoes referentes a pagamentos do mes M ficam disponiveis no dia
          escolhido do mes M+1.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar configuracoes"}
        </Button>
      </div>
    </Card>
  )
}
