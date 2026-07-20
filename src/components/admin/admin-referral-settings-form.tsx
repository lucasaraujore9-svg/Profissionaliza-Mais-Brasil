"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Info } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CommissionPlanEditor,
  cleanBrackets,
  phasesFromJson,
  settingsFromJson,
  planToJson,
  type PlanSettingsDraft,
  type PayoutBase,
  type PhaseDraft,
} from "@/components/admin/commission-plan-editor"
import type { CommissionBracket } from "@/lib/referrals/rules"

type Scope = "ALL" | "NEW_ONLY"

/** Modo de edicao — os dois gravam no MESMO bloco `commission*`. */
type EditorMode = "SIMPLE" | "ADVANCED"

interface InitialValues {
  referralEnabled: boolean
  defaultReferralPercent: number
  /** Minimo padrao de indicacoes ATIVAS para o indicador receber. 0 = sem minimo. */
  defaultReferralMinReferrals: number
  referralMinPayout: number
  referralPayoutDay: number
  commissionBracketBasis: "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS"
  commissionRateType: "FIXED" | "PERCENT"
  commissionPayoutBase: PayoutBase
  commissionBrackets: CommissionBracket[]
  /** Plano multi-fase persistido (JSON cru do banco). */
  commissionPlan: unknown
}

/**
 * Regra global que esta valendo agora, resolvida NO SERVIDOR pelo mesmo
 * `resolveEffectiveCommission` que o fechamento mensal usa. Vem pronta como
 * prop — e por isso que a tela nao consegue anunciar uma regra diferente da que
 * o sistema paga.
 */
export interface CommissionPreview {
  description: string
  warnings: string[]
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

/**
 * Extrai o percentual de uma regra que seja "fase unica + faixa unica +
 * PERCENT" — o formato que o editor Simples produz. Devolve null quando a regra
 * salva e mais complexa que isso (ai a tela abre direto no Avancado, sem
 * achatar nada).
 */
function simplePercentFrom(initial: InitialValues): number | null {
  const planPhases = phasesFromJson(initial.commissionPlan)
  if (planPhases.length > 1) return null
  const phase = planPhases[0]
  if (phase) {
    if (phase.rateType !== "PERCENT" || phase.brackets.length !== 1) return null
    if (phase.brackets[0].upTo !== null) return null
    return phase.brackets[0].value
  }
  const brackets = initial.commissionBrackets
  if (brackets.length !== 1 || brackets[0].upTo !== null) return null
  if (initial.commissionRateType !== "PERCENT") return null
  return brackets[0].value
}

/** Sem plano e sem faixas: a rede nunca configurou regra (roda no fallback). */
function isUnconfigured(initial: InitialValues): boolean {
  return (
    phasesFromJson(initial.commissionPlan).length === 0 &&
    initial.commissionBrackets.length === 0
  )
}

/**
 * Regra GLOBAL de comissao de indicacao (padrao da rede).
 *
 * Espelha o card por revendedor (`ResellerCommissionOverrideForm`): dois niveis
 * de edicao (Simples e Avancado) sobre o MESMO armazenamento `commission*`, com
 * um preview vindo do resolvedor que o motor usa. O seletor de "modelo de
 * comissao" saiu: o motor e unico (fechamento mensal) desde a unificacao.
 */
export function AdminReferralSettingsForm({
  initial,
  preview,
}: {
  initial: InitialValues
  /** Regra efetiva global ja resolvida no servidor. Atualiza junto com `initial`. */
  preview: CommissionPreview
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [referralEnabled, setReferralEnabled] = useState(initial.referralEnabled)
  const [defaultReferralPercent, setDefaultReferralPercent] = useState(
    initial.defaultReferralPercent,
  )
  const [defaultMinReferrals, setDefaultMinReferrals] = useState(
    initial.defaultReferralMinReferrals,
  )
  const [referralMinPayout, setReferralMinPayout] = useState(initial.referralMinPayout)
  const [referralPayoutDay, setReferralPayoutDay] = useState(initial.referralPayoutDay)
  const simplePercent = simplePercentFrom(initial)
  const [editorMode, setEditorMode] = useState<EditorMode>(
    simplePercent != null || isUnconfigured(initial) ? "SIMPLE" : "ADVANCED",
  )
  const [percent, setPercent] = useState<number>(
    simplePercent ?? initial.defaultReferralPercent,
  )
  const [phases, setPhases] = useState<PhaseDraft[]>(() => initialPhases(initial))
  const [planSettings, setPlanSettings] = useState<PlanSettingsDraft>(() =>
    settingsFromJson(initial.commissionPlan),
  )
  const [scope, setScope] = useState<Scope>("ALL")

  function submit() {
    if (defaultReferralPercent < 0 || defaultReferralPercent > 100) {
      toast.error("O percentual padrão deve estar entre 0 e 100")
      return
    }
    if (
      !Number.isInteger(defaultMinReferrals) ||
      defaultMinReferrals < 0 ||
      defaultMinReferrals > 1000
    ) {
      toast.error("O mínimo de indicações deve ser um inteiro entre 0 e 1000")
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

    // Bloco `commission*` — os dois editores gravam nas mesmas colunas.
    let rulePayload: Record<string, unknown>

    if (editorMode === "SIMPLE") {
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        toast.error("O percentual da regra deve estar entre 0 e 100")
        return
      }
      rulePayload = {
        commissionRateType: "PERCENT",
        commissionBracketBasis: "ACTIVE_UNITS",
        commissionPayoutBase: "ALL_ACTIVE",
        commissionBrackets: [{ upTo: null, value: percent }],
        // Fase unica nao precisa de plano — limpa qualquer plano residual para o
        // Simples nao ficar escondido atras de um multi-fase antigo.
        commissionPlan: null,
      }
    } else {
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

      // Fase representativa (1a) alimenta os campos singulares exigidos pela API
      // e o fallback do motor. O plano multi-fase só vai quando há > 1 fase.
      const rep = phases[0]
      rulePayload = {
        commissionBracketBasis: rep.bracketBasis,
        commissionRateType: rep.rateType,
        commissionPayoutBase: rep.payoutBase,
        commissionBrackets: cleanBrackets(rep.brackets),
        commissionPlan:
          phases.length > 1
            ? planToJson(
                phases.map((p, i) => ({
                  ...p,
                  // a última fase sempre "em diante"
                  durationMonths:
                    i === phases.length - 1 ? null : (p.durationMonths ?? 1),
                  brackets: cleanBrackets(p.brackets),
                })),
                planSettings,
              )
            : null,
      }
    }

    const payload = {
      referralEnabled,
      defaultReferralPercent,
      defaultReferralMinReferrals: defaultMinReferrals,
      referralMinPayout,
      referralPayoutDay,
      // Motor unico: nao ha mais escolha de modelo.
      commissionMode: "MONTHLY_TIERED",
      ...rulePayload,
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
      {/* Regra que esta valendo AGORA — vem do mesmo resolvedor que o motor usa. */}
      <div className="rounded-md border border-[var(--color-pmb-green)]/30 bg-[var(--color-pmb-lime-50)]/40 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green-900)]" />
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
              Regra efetiva hoje
            </span>
            <p className="text-xs text-gray-700">{preview.description}</p>
          </div>
        </div>
        {preview.warnings.map((w) => (
          <p
            key={w}
            className="mt-2 flex items-start gap-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {w}
          </p>
        ))}
      </div>

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
            Regra padrão da rede
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Quanto cada indicador ganha sobre a mensalidade das revendas que ele
            indicar. Vale para toda unidade que não tem regra própria (definida na
            aba “Comissões” do revendedor). Tudo é apurado no fechamento mensal.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Como definir</Label>
          <select
            className={selectClass}
            value={editorMode}
            onChange={(e) => setEditorMode(e.target.value as EditorMode)}
          >
            <option value="SIMPLE">
              Simples — um percentual fixo sobre cada mensalidade
            </option>
            <option value="ADVANCED">
              Avançado — faixas por volume e fases por tempo
            </option>
          </select>
        </div>

        {editorMode === "SIMPLE" ? (
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
              % da mensalidade de cada unidade indicada ativa, apurado no
              fechamento mensal.
            </p>
          </div>
        ) : (
          <CommissionPlanEditor
            phases={phases}
            onChange={setPhases}
            settings={planSettings}
            onSettingsChange={setPlanSettings}
          />
        )}

        <div className="space-y-2 border-t border-gray-100 pt-5">
          <Label>Mínimo de indicações ativas (padrão)</Label>
          <Input
            type="number"
            step="1"
            min={0}
            max={1000}
            value={defaultMinReferrals}
            onChange={(e) => setDefaultMinReferrals(Number(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Quantas indicadas ativas um indicador precisa ter para começar a
            receber. 0 = sem mínimo. Enquanto não atingir, as comissões ficam
            retidas e são apuradas retroativamente quando o mínimo for alcançado.
            Cada unidade pode ter um mínimo próprio.
          </p>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-5">
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
            Último fallback: só é usado quando não há regra global configurada
            acima nem regra própria da unidade. Em operação normal, nenhum
            indicador cai aqui.
          </p>
        </div>
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
