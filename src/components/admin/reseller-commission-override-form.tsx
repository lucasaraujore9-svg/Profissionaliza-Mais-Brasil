"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CommissionPlanEditor,
  cleanBrackets,
  phasesFromJson,
  type PhaseDraft,
} from "@/components/admin/commission-plan-editor"
import { parseBrackets } from "@/lib/referrals/rules"

type CommissionMode = "PER_PAYMENT_PERCENT" | "MONTHLY_TIERED"

export interface OverrideInitial {
  overrideSource: "MANUAL" | "FROZEN" | null
  commissionMode: CommissionMode | null
  commissionBracketBasis: "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS" | null
  commissionRateType: "FIXED" | "PERCENT" | null
  commissionPayoutBase: "ALL_ACTIVE" | "REFERRED_THIS_MONTH" | null
  commissionBrackets: unknown
  commissionPlan: unknown
  referralPercent: number | null
}

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

function initialPhases(initial: OverrideInitial): PhaseDraft[] {
  const fromPlan = phasesFromJson(initial.commissionPlan)
  if (fromPlan.length > 0) return fromPlan
  const brackets = parseBrackets(initial.commissionBrackets)
  return [
    {
      durationMonths: null,
      rateType: initial.commissionRateType ?? "FIXED",
      bracketBasis: initial.commissionBracketBasis ?? "NEW_REFERRALS_MONTH",
      payoutBase: initial.commissionPayoutBase ?? "ALL_ACTIVE",
      brackets: brackets.length > 0 ? brackets : [{ upTo: 10, value: 0 }],
    },
  ]
}

/**
 * Override de comissao por revendedor (como ESTA unidade ganha quando indica
 * outras). "Herda a regra global" limpa o override; "regra própria" grava um
 * override MANUAL (preservado mesmo quando o admin aplica a regra global a todas).
 */
export function ResellerCommissionOverrideForm({
  tenantId,
  initial,
}: {
  tenantId: string
  initial: OverrideInitial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const hasOverride = initial.overrideSource != null
  const [ownRule, setOwnRule] = useState(hasOverride)
  const [mode, setMode] = useState<CommissionMode>(
    initial.commissionMode ?? "MONTHLY_TIERED",
  )
  const [percent, setPercent] = useState<number>(initial.referralPercent ?? 5)
  const [phases, setPhases] = useState<PhaseDraft[]>(() => initialPhases(initial))

  const isMonthly = mode === "MONTHLY_TIERED"

  function submit() {
    startTransition(async () => {
      let payload: Record<string, unknown>

      if (!ownRule) {
        // Volta a herdar o global (limpa todo o override de comissão).
        payload = { clearCommissionOverride: true }
      } else if (isMonthly) {
        // Validação cliente das fases.
        if (phases.length === 0) {
          toast.error("Adicione ao menos uma fase")
          return
        }
        for (let i = 0; i < phases.length - 1; i++) {
          if (phases[i].durationMonths === null) {
            toast.error(
              "Só a última fase pode ser 'em diante'. Defina a duração das anteriores.",
            )
            return
          }
        }
        for (const p of phases) {
          if (p.brackets.filter((b) => b.upTo === null).length > 1) {
            toast.error("Em cada fase, apenas uma faixa pode ser 'sem teto'")
            return
          }
          if (p.brackets.some((b) => b.value < 0)) {
            toast.error("Valores de faixa não podem ser negativos")
            return
          }
        }
        const rep = phases[0]
        const planPayload =
          phases.length > 1
            ? phases.map((p, i) => ({
                durationMonths:
                  i === phases.length - 1 ? null : (p.durationMonths ?? 1),
                rateType: p.rateType,
                bracketBasis: p.bracketBasis,
                payoutBase: p.payoutBase,
                brackets: cleanBrackets(p.brackets),
              }))
            : null
        payload = {
          commissionMode: "MONTHLY_TIERED",
          commissionBracketBasis: rep.bracketBasis,
          commissionRateType: rep.rateType,
          commissionPayoutBase: rep.payoutBase,
          commissionBrackets: cleanBrackets(rep.brackets),
          commissionPlan: planPayload,
        }
      } else {
        // Override legado: % por mensalidade.
        if (percent < 0 || percent > 100) {
          toast.error("O percentual deve estar entre 0 e 100")
          return
        }
        payload = {
          commissionMode: "PER_PAYMENT_PERCENT",
          percent,
          // limpa qualquer override por faixas residual (evita faixas órfãs no
          // banco que ressurgiriam se o modo voltasse a MONTHLY_TIERED).
          commissionBracketBasis: null,
          commissionRateType: null,
          commissionPayoutBase: null,
          commissionBrackets: null,
          commissionPlan: null,
        }
      }

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/referral-percent`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const firstFieldMsg = body.fields
          ? (Object.values(body.fields).flat()[0] as string | undefined)
          : undefined
        toast.error(
          firstFieldMsg
            ? `${body.error ?? "Dados inválidos"}: ${firstFieldMsg}`
            : (body.error ?? "Falha ao salvar"),
        )
        return
      }
      toast.success("Regra de comissão do revendedor atualizada")
      router.refresh()
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Regra de comissão deste revendedor
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Como esta unidade ganha comissão quando indica novas revendas. Por
          padrão herda a regra global; aqui você pode definir uma regra própria.
        </p>
        {initial.overrideSource === "FROZEN" && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Esta unidade foi <strong>congelada</strong> na regra anterior quando a
            regra global mudou (escopo “apenas novas”). Edite abaixo para ajustá-la
            ou volte a herdar o global.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="ownRule"
            className="mt-1"
            checked={!ownRule}
            onChange={() => setOwnRule(false)}
          />
          <span>
            <span className="font-medium">Herda a regra global</span>
            <span className="block text-xs text-gray-500">
              Segue o padrão configurado em Configurações → Indicações.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="ownRule"
            className="mt-1"
            checked={ownRule}
            onChange={() => setOwnRule(true)}
          />
          <span>
            <span className="font-medium">Regra própria (override)</span>
            <span className="block text-xs text-gray-500">
              Define uma regra exclusiva para esta unidade.
            </span>
          </span>
        </label>
      </div>

      {ownRule && (
        <div className="space-y-5 border-t border-gray-100 pt-5">
          <div className="space-y-2">
            <Label>Modelo de comissão</Label>
            <select
              className={selectClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as CommissionMode)}
            >
              <option value="PER_PAYMENT_PERCENT">
                Percentual por mensalidade (legado, por pagamento)
              </option>
              <option value="MONTHLY_TIERED">
                Por faixas (valor/percentual no fechamento mensal)
              </option>
            </select>
          </div>

          {isMonthly ? (
            <CommissionPlanEditor phases={phases} onChange={setPhases} />
          ) : (
            <div className="space-y-2">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
              <p className="text-xs text-gray-500">
                % da mensalidade de cada unidade indicada, por pagamento recebido.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar regra"}
        </Button>
      </div>
    </Card>
  )
}
