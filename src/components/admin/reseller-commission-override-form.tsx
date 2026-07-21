"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CommissionPlanEditor,
  cleanBrackets,
  phasesFromJson,
  settingsFromJson,
  planToJson,
  type PhaseDraft,
  type PlanSettingsDraft,
  type PayoutBase,
} from "@/components/admin/commission-plan-editor";
import { parseBrackets } from "@/lib/referrals/rules";

export interface OverrideInitial {
  overrideSource: "MANUAL" | "FROZEN" | null;
  commissionBracketBasis: "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS" | null;
  commissionRateType: "FIXED" | "PERCENT" | null;
  commissionPayoutBase: PayoutBase | null;
  commissionBrackets: unknown;
  commissionPlan: unknown;
  /** Minimo de indicacoes ATIVAS para esta unidade receber. null = padrao global. */
  referralMinReferrals: number | null;
  /** Padrao global exibido como placeholder quando nao ha override. */
  defaultMinReferrals: number;
}

/**
 * Regra que esta valendo agora, resolvida NO SERVIDOR pelo mesmo
 * `resolveEffectiveCommission` que o fechamento mensal usa. Vem pronta como
 * prop (nao ha fetch no cliente) — e por isso que a tela nao consegue mostrar
 * um percentual diferente do que o sistema paga.
 */
export interface CommissionPreview {
  description: string;
  warnings: string[];
}

/** Modo de edicao — os dois gravam no MESMO bloco `commission*`. */
type EditorMode = "SIMPLE" | "ADVANCED";

/**
 * Extrai o percentual de uma regra que seja "fase unica, faixa unica, PERCENT" —
 * o formato que o editor Simples produz. Devolve null quando a regra e mais
 * complexa que isso (ai a tela abre direto no Avancado, sem achatar nada).
 */
function simplePercentFrom(initial: OverrideInitial): number | null {
  const planPhases = phasesFromJson(initial.commissionPlan);
  if (planPhases.length > 1) return null;
  const phase = planPhases[0];
  if (phase) {
    if (phase.rateType !== "PERCENT" || phase.brackets.length !== 1)
      return null;
    if (phase.brackets[0].upTo !== null) return null;
    return phase.brackets[0].value;
  }
  const brackets = parseBrackets(initial.commissionBrackets);
  if (brackets.length !== 1 || brackets[0].upTo !== null) return null;
  if (initial.commissionRateType !== "PERCENT") return null;
  return brackets[0].value;
}

function initialPhases(initial: OverrideInitial): PhaseDraft[] {
  const fromPlan = phasesFromJson(initial.commissionPlan);
  if (fromPlan.length > 0) return fromPlan;
  const brackets = parseBrackets(initial.commissionBrackets);
  return [
    {
      durationMonths: null,
      rateType: initial.commissionRateType ?? "PERCENT",
      bracketBasis: initial.commissionBracketBasis ?? "ACTIVE_UNITS",
      payoutBase: initial.commissionPayoutBase ?? "ALL_ACTIVE",
      brackets: brackets.length > 0 ? brackets : [{ upTo: null, value: 10 }],
    },
  ];
}

/**
 * CARD UNICO de regra de comissao de indicacao.
 *
 * Antes havia dois cards irmaos nesta mesma aba — "Percentual de comissão
 * (override)" e "Regra de comissão deste revendedor" — que gravavam a mesma
 * coluna por caminhos diferentes e discordavam entre si. Agora ha um so lugar
 * para registrar a regra, com dois niveis de edicao (Simples e Avancado) sobre
 * o MESMO armazenamento, e um preview vindo do resolvedor que o motor usa.
 *
 * A regra pertence ao INDICADOR: define como ESTA unidade ganha quando indica
 * outras. O relogio das fases ("primeiros N meses") e o de cada unidade
 * indicada, contado a partir da ativacao dela.
 */
export function ResellerCommissionOverrideForm({
  tenantId,
  initial,
  preview,
  onSaved,
}: {
  tenantId: string;
  initial: OverrideInitial;
  /** Regra efetiva ja resolvida no servidor. Atualiza junto com `initial`. */
  preview: CommissionPreview;
  /** Chamado após salvar (ex.: recarregar dados da tela). Sem isto, faz router.refresh(). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasOverride = initial.overrideSource != null;
  const [ownRule, setOwnRule] = useState(hasOverride);
  const simplePercent = simplePercentFrom(initial);
  const [editorMode, setEditorMode] = useState<EditorMode>(
    simplePercent != null || !hasOverride ? "SIMPLE" : "ADVANCED",
  );
  const [percent, setPercent] = useState<number>(simplePercent ?? 10);
  const [phases, setPhases] = useState<PhaseDraft[]>(() =>
    initialPhases(initial),
  );
  const [planSettings, setPlanSettings] = useState<PlanSettingsDraft>(() =>
    settingsFromJson(initial.commissionPlan),
  );
  const [minInput, setMinInput] = useState(
    initial.referralMinReferrals != null
      ? String(initial.referralMinReferrals)
      : "",
  );

  function submit() {
    startTransition(async () => {
      const min = minInput.trim();
      const minReferrals = min === "" ? null : Number(min);
      if (
        minReferrals != null &&
        (!Number.isInteger(minReferrals) || minReferrals < 0)
      ) {
        toast.error(
          "O mínimo de indicações deve ser um número inteiro (0 = sem mínimo)",
        );
        return;
      }

      let payload: Record<string, unknown>;

      if (!ownRule) {
        // Volta a herdar o global (limpa TODO o override, inclusive o legado).
        payload = { clearCommissionOverride: true, minReferrals };
      } else if (editorMode === "SIMPLE") {
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          toast.error("O percentual deve estar entre 0 e 100");
          return;
        }
        payload = {
          commissionMode: "MONTHLY_TIERED",
          commissionRateType: "PERCENT",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "ALL_ACTIVE",
          commissionBrackets: [{ upTo: null, value: percent }],
          // Fase unica nao precisa de plano — limpa qualquer plano residual para
          // o Simples nao ficar escondido atras de um multi-fase antigo.
          commissionPlan: null,
          minReferrals,
        };
      } else {
        if (phases.length === 0) {
          toast.error("Adicione ao menos uma fase");
          return;
        }
        for (let i = 0; i < phases.length - 1; i++) {
          if (phases[i].durationMonths === null) {
            toast.error(
              "Só a última fase pode ser 'em diante'. Defina a duração das anteriores.",
            );
            return;
          }
        }
        for (const p of phases) {
          if (p.brackets.filter((b) => b.upTo === null).length > 1) {
            toast.error("Em cada fase, apenas uma faixa pode ser 'sem teto'");
            return;
          }
          if (p.brackets.some((b) => b.value < 0)) {
            toast.error("Valores de faixa não podem ser negativos");
            return;
          }
        }
        const rep = phases[0];
        const planPayload =
          phases.length > 1
            ? planToJson(
                phases.map((p, i) => ({
                  ...p,
                  durationMonths:
                    i === phases.length - 1 ? null : (p.durationMonths ?? 1),
                  brackets: cleanBrackets(p.brackets),
                })),
                planSettings,
              )
            : null;
        payload = {
          commissionMode: "MONTHLY_TIERED",
          commissionBracketBasis: rep.bracketBasis,
          commissionRateType: rep.rateType,
          commissionPayoutBase: rep.payoutBase,
          commissionBrackets: cleanBrackets(rep.brackets),
          commissionPlan: planPayload,
          minReferrals,
        };
      }

      const res = await fetch(
        `/api/admin/tenants/${tenantId}/referral-percent`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const firstFieldMsg = body.fields
          ? (Object.values(body.fields).flat()[0] as string | undefined)
          : undefined;
        toast.error(
          firstFieldMsg
            ? `${body.error ?? "Dados inválidos"}: ${firstFieldMsg}`
            : (body.error ?? "Falha ao salvar"),
        );
        return;
      }
      toast.success("Regra de comissão atualizada");
      if (onSaved) onSaved();
      else router.refresh();
    });
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Regra de comissão de indicação
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Quanto <strong>esta unidade ganha</strong> sobre a mensalidade das
          revendas que ela indicar. Por padrão herda a regra global; aqui você
          pode definir uma regra própria.
        </p>
        {initial.overrideSource === "FROZEN" && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Esta unidade foi <strong>congelada</strong> na regra anterior quando
            a regra global mudou (escopo “apenas novas”). Edite abaixo para
            ajustá-la ou volte a herdar o global.
          </p>
        )}
      </div>

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
            <Label>Como definir</Label>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
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
        </div>
      )}

      <div className="space-y-2 border-t border-gray-100 pt-5">
        <Label>Mínimo de indicações ativas</Label>
        <Input
          type="number"
          step="1"
          min={0}
          value={minInput}
          placeholder={`Padrão: ${initial.defaultMinReferrals}`}
          onChange={(e) => setMinInput(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          Quantas indicadas ativas esta unidade precisa ter para começar a
          receber. Vazio usa o padrão global ({initial.defaultMinReferrals}); 0
          remove o mínimo. Enquanto não atingir, as comissões ficam retidas e
          são apuradas retroativamente quando o mínimo for alcançado.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar regra"}
        </Button>
      </div>
    </Card>
  );
}
