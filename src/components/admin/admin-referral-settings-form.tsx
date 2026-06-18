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
import type { CommissionBracket } from "@/lib/referrals/rules"

type CommissionMode = "PER_PAYMENT_PERCENT" | "MONTHLY_TIERED"
type Scope = "ALL" | "NEW_ONLY"

interface InitialValues {
  referralEnabled: boolean
  defaultReferralPercent: number
  referralMinPayout: number
  referralPayoutDay: number
  commissionMode: CommissionMode
  commissionBracketBasis: "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS"
  commissionRateType: "FIXED" | "PERCENT"
  commissionPayoutBase: "ALL_ACTIVE" | "REFERRED_THIS_MONTH"
  commissionBrackets: CommissionBracket[]
  /** Plano multi-fase persistido (JSON cru do banco). */
  commissionPlan: unknown
}

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

/** Fases iniciais: plano persistido tem prioridade; senao sintetiza 1 fase
 *  a partir dos campos singulares (preserva quem nunca configurou multi-fase). */
function initialPhases(initial: InitialValues): PhaseDraft[] {
  const fromPlan = phasesFromJson(initial.commissionPlan)
  if (fromPlan.length > 0) return fromPlan
  return [
    {
      durationMonths: null,
      rateType: initial.commissionRateType,
      bracketBasis: initial.commissionBracketBasis,
      payoutBase: initial.commissionPayoutBase,
      brackets:
        initial.commissionBrackets.length > 0
          ? initial.commissionBrackets
          : [{ upTo: 10, value: 0 }],
    },
  ]
}

export function AdminReferralSettingsForm({ initial }: { initial: InitialValues }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [referralEnabled, setReferralEnabled] = useState(initial.referralEnabled)
  const [defaultReferralPercent, setDefaultReferralPercent] = useState(
    initial.defaultReferralPercent,
  )
  const [referralMinPayout, setReferralMinPayout] = useState(initial.referralMinPayout)
  const [referralPayoutDay, setReferralPayoutDay] = useState(initial.referralPayoutDay)
  const [commissionMode, setCommissionMode] = useState<CommissionMode>(
    initial.commissionMode,
  )
  const [phases, setPhases] = useState<PhaseDraft[]>(() => initialPhases(initial))
  const [scope, setScope] = useState<Scope>("ALL")

  const isMonthly = commissionMode === "MONTHLY_TIERED"

  function submit() {
    if (defaultReferralPercent < 0 || defaultReferralPercent > 100) {
      toast.error("O percentual deve estar entre 0 e 100")
      return
    }
    if (referralMinPayout < 0 || referralMinPayout > 100000) {
      toast.error("Saque mínimo deve estar entre R$ 0 e R$ 100.000")
      return
    }
    if (referralPayoutDay < 1 || referralPayoutDay > 20) {
      toast.error("Dia do payout deve estar entre 1 e 20")
      return
    }

    if (isMonthly) {
      if (phases.length === 0) {
        toast.error("Adicione ao menos uma fase de comissão")
        return
      }
      for (let i = 0; i < phases.length - 1; i++) {
        if (phases[i].durationMonths === null) {
          toast.error(
            "Só a última fase pode ser 'em diante'. Defina a duração das fases anteriores.",
          )
          return
        }
      }
      for (const p of phases) {
        if (p.brackets.length === 0) {
          toast.error("Cada fase precisa de ao menos uma faixa")
          return
        }
        if (p.brackets.filter((b) => b.upTo === null).length > 1) {
          toast.error("Em cada fase, apenas uma faixa pode ser 'sem teto'")
          return
        }
        if (p.brackets.some((b) => b.value < 0)) {
          toast.error("Valores de faixa não podem ser negativos")
          return
        }
      }
    }

    // Fase representativa (1a) alimenta os campos singulares exigidos pela API e
    // o fallback do motor. O plano multi-fase só é enviado quando há > 1 fase.
    const rep = phases[0]
    const planPayload =
      isMonthly && phases.length > 1
        ? phases.map((p, i) => ({
            // a última fase sempre "em diante"
            durationMonths:
              i === phases.length - 1 ? null : (p.durationMonths ?? 1),
            rateType: p.rateType,
            bracketBasis: p.bracketBasis,
            payoutBase: p.payoutBase,
            brackets: cleanBrackets(p.brackets),
          }))
        : []

    const payload = {
      referralEnabled,
      defaultReferralPercent,
      referralMinPayout,
      referralPayoutDay,
      commissionMode,
      commissionBracketBasis: rep?.bracketBasis ?? "NEW_REFERRALS_MONTH",
      commissionRateType: rep?.rateType ?? "FIXED",
      commissionPayoutBase: rep?.payoutBase ?? "ALL_ACTIVE",
      commissionBrackets: rep ? cleanBrackets(rep.brackets) : [],
      commissionPlan: planPayload,
      scope,
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/system-settings/referrals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
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
      toast.success(
        scope === "NEW_ONLY"
          ? "Salvo. Revendas existentes foram congeladas na regra anterior."
          : "Configurações atualizadas",
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-5">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={referralEnabled}
              onChange={(e) => setReferralEnabled(e.target.checked)}
            />
            Programa de indicação ativo
          </Label>
          <p className="text-xs text-gray-500">
            Quando desativado, novas comissões deixam de ser geradas.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Valor mínimo de saque (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={100000}
            value={referralMinPayout}
            onChange={(e) => setReferralMinPayout(Number(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label>Dia do payout mensal (1-20)</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={referralPayoutDay}
            onChange={(e) => setReferralPayoutDay(Number(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Comissões referentes ao mês M ficam disponíveis no dia escolhido do
            mês M+1.
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Como a comissão é calculada
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Escolha o modelo de cálculo padrão da rede. Cada unidade pode ter um
            override próprio na aba “Comissões” do revendedor.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Modelo de comissão</Label>
          <select
            className={selectClass}
            value={commissionMode}
            onChange={(e) => setCommissionMode(e.target.value as CommissionMode)}
          >
            <option value="PER_PAYMENT_PERCENT">
              Percentual por mensalidade (legado, por pagamento)
            </option>
            <option value="MONTHLY_TIERED">
              Por faixas (valor/percentual no fechamento mensal)
            </option>
          </select>
        </div>

        {!isMonthly ? (
          <div className="space-y-2">
            <Label>Percentual padrão (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={defaultReferralPercent}
              onChange={(e) => setDefaultReferralPercent(Number(e.target.value))}
            />
            <p className="text-xs text-gray-500">
              Aplicado aos indicadores sem override individual.
            </p>
          </div>
        ) : (
          <CommissionPlanEditor phases={phases} onChange={setPhases} />
        )}
      </Card>

      {/* Escopo da mudança — congelar existentes ou aplicar a todas. */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Aplicar esta regra a
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Define o que acontece com as revendas que já existem ao salvar.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              className="mt-1"
              checked={scope === "ALL"}
              onChange={() => setScope("ALL")}
            />
            <span>
              <span className="font-medium">Todas as revendas</span>
              <span className="block text-xs text-gray-500">
                Quem não tem regra própria passa a seguir a nova regra. Overrides
                manuais por revendedor são preservados.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              className="mt-1"
              checked={scope === "NEW_ONLY"}
              onChange={() => setScope("NEW_ONLY")}
            />
            <span>
              <span className="font-medium">
                Apenas revendas cadastradas a partir de agora
              </span>
              <span className="block text-xs text-gray-500">
                As revendas atuais são congeladas na regra anterior (como override).
                Só as novas herdam esta regra. Você ainda pode ajustar cada uma na
                aba “Comissões” do revendedor.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  )
}
