"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Save, GaugeCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

interface InitialValues {
  enabled: boolean
  strict: boolean
}

/** Contagem do impacto — o admin decide vendo quantos alunos a regra alcança. */
interface Impact {
  /** Matrículas ativas sob a regra (carnê/mensalidade com mais de 1 parcela). */
  gated: number
  /** Dessas, quantas já passaram da fatia paga. */
  overQuota: number
  /** Quantas estão travadas agora. */
  blocked: number
}

export function AdminPaceGateSettingsForm({
  initial,
  impact,
}: {
  initial: InitialValues
  impact: Impact
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [strict, setStrict] = useState(initial.strict)

  const isDirty = enabled !== initial.enabled || strict !== initial.strict

  function submit() {
    startTransition(async () => {
      const res = await fetch("/api/admin/system-settings/pace-gate", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, strict }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(
        enabled ? "Cota de aulas ativada" : "Cota de aulas desativada",
      )
      router.refresh()
    })
  }

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-mist)] p-3">
        <GaugeCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
        <div className="text-xs text-[var(--color-pmb-green-900)]">
          O aluno que paga parcelado só avança até a fração do curso que já
          pagou: <strong>cota = parcelas pagas ÷ parcelas totais</strong>. Em 6x,
          a 1ª parcela libera 16% do curso; em 2x, 50%. Ao atingir a cota o curso
          trava, e a parcela seguinte libera a fatia seguinte. O certificado só
          sai com o plano quitado.
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
            Aplicar a cota de aulas na rede
          </p>
          <p className="text-xs text-gray-500">
            Vale para carnê no boleto e mensalidade. Compra à vista e cartão
            parcelado ficam de fora — nos dois o valor já foi autorizado.
            Desligar solta na hora quem estiver travado.
          </p>
        </div>
        <span
          className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            initial.enabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {initial.enabled ? "Ativa" : "Desativada"}
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <Switch
          checked={strict}
          onCheckedChange={(c) => setStrict(c)}
          disabled={!enabled}
          className="mt-0.5"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Modo estrito
          </p>
          <p className="text-xs text-gray-500">
            Em cursos da plataforma antiga o acesso é por login, não por curso:
            cortar por causa de um curso derruba os outros da mesma pessoa. No
            modo normal só cortamos quem não tem nenhum outro curso liberado. No
            estrito, corta assim que qualquer curso bate a cota — mais garantia
            de recebimento, com o risco de derrubar um curso já quitado.
          </p>
        </div>
      </label>

      <dl className="grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50/40 p-3 text-center">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">
            Sob a regra
          </dt>
          <dd className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {impact.gated}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">
            Passaram da cota
          </dt>
          <dd className="text-lg font-semibold text-amber-700">
            {impact.overQuota}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">
            Travadas agora
          </dt>
          <dd className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {impact.blocked}
          </dd>
        </div>
        <p className="col-span-3 text-left text-[11px] text-gray-500">
          &ldquo;Passaram da cota&rdquo; são as matrículas ativas que já
          assistiram mais do que pagaram. Ao ativar, elas travam na próxima
          varredura (diária, 4h30 de Brasília) ou assim que o progresso for
          sincronizado. Caso a caso, a trava pode ser liberada na ficha do aluno.
        </p>
      </dl>

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
