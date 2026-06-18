"use client"

import { Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parsePlan, type CommissionBracket } from "@/lib/referrals/rules"

export type RateType = "FIXED" | "PERCENT"
export type BracketBasis = "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS"
export type PayoutBase = "ALL_ACTIVE" | "REFERRED_THIS_MONTH"

/** Uma fase do plano em edicao. durationMonths null = fase final "em diante". */
export interface PhaseDraft {
  durationMonths: number | null
  rateType: RateType
  bracketBasis: BracketBasis
  payoutBase: PayoutBase
  brackets: CommissionBracket[]
}

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

/** Fase nova padrao (faixa unica sem teto, fase "em diante"). */
export function emptyPhase(): PhaseDraft {
  return {
    durationMonths: null,
    rateType: "FIXED",
    bracketBasis: "NEW_REFERRALS_MONTH",
    payoutBase: "ALL_ACTIVE",
    brackets: [{ upTo: 10, value: 0 }],
  }
}

function basisNoun(basis: BracketBasis): string {
  return basis === "NEW_REFERRALS_MONTH" ? "indicações no mês" : "unidades ativas"
}

/**
 * Editor de plano de comissao MULTI-FASE. Cada fase vale por um intervalo de
 * meses contados desde a entrada de CADA unidade indicada (relogio proprio da
 * unidade). Controlado: recebe `phases` e emite o array novo em `onChange`.
 */
export function CommissionPlanEditor({
  phases,
  onChange,
}: {
  phases: PhaseDraft[]
  onChange: (next: PhaseDraft[]) => void
}) {
  function updatePhase(i: number, patch: Partial<PhaseDraft>) {
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function updateBracket(pi: number, bi: number, patch: Partial<CommissionBracket>) {
    onChange(
      phases.map((p, idx) =>
        idx === pi
          ? {
              ...p,
              brackets: p.brackets.map((b, j) => (j === bi ? { ...b, ...patch } : b)),
            }
          : p,
      ),
    )
  }
  function addBracket(pi: number) {
    onChange(
      phases.map((p, idx) =>
        idx === pi && p.brackets.length < 20
          ? { ...p, brackets: [...p.brackets, { upTo: null, value: 0 }] }
          : p,
      ),
    )
  }
  function removeBracket(pi: number, bi: number) {
    onChange(
      phases.map((p, idx) =>
        idx === pi
          ? { ...p, brackets: p.brackets.filter((_, j) => j !== bi) }
          : p,
      ),
    )
  }
  function addPhase() {
    if (phases.length >= 12) return
    onChange([...phases, emptyPhase()])
  }
  function removePhase(i: number) {
    onChange(phases.filter((_, idx) => idx !== i))
  }

  const multi = phases.length > 1

  return (
    <div className="space-y-4">
      {phases.map((phase, pi) => {
        const isPercent = phase.rateType === "PERCENT"
        const noun = basisNoun(phase.bracketBasis)
        const isLast = pi === phases.length - 1
        return (
          <div
            key={pi}
            className="space-y-4 rounded-lg border border-[var(--color-pmb-green-900)]/15 bg-[var(--color-pmb-green-900)]/5 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
                {multi ? `Fase ${pi + 1}` : "Regra"}
              </span>
              {phases.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePhase(pi)}
                  className="text-xs font-medium text-gray-400 hover:text-rose-600"
                >
                  Remover fase
                </button>
              )}
            </div>

            {/* Duracao da fase (relogio por unidade indicada) */}
            {multi && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Vale pelos primeiros</span>
                {phase.durationMonths === null ? (
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    em diante
                  </span>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="w-20"
                    value={phase.durationMonths}
                    onChange={(e) =>
                      updatePhase(pi, {
                        durationMonths: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      })
                    }
                  />
                )}
                <span className="text-gray-600">
                  {phase.durationMonths === null ? "" : "meses de cada unidade"}
                </span>
                <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={phase.durationMonths === null}
                    onChange={(e) =>
                      updatePhase(pi, {
                        durationMonths: e.target.checked ? null : 3,
                      })
                    }
                  />
                  em diante (última)
                </label>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>A faixa é definida por</Label>
                <select
                  className={selectClass}
                  value={phase.bracketBasis}
                  onChange={(e) =>
                    updatePhase(pi, { bracketBasis: e.target.value as BracketBasis })
                  }
                >
                  <option value="NEW_REFERRALS_MONTH">
                    Novas revendas indicadas no mês
                  </option>
                  <option value="ACTIVE_UNITS">Nº de unidades ativas</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de valor</Label>
                <select
                  className={selectClass}
                  value={phase.rateType}
                  onChange={(e) =>
                    updatePhase(pi, { rateType: e.target.value as RateType })
                  }
                >
                  <option value="FIXED">Valor fixo (R$) por unidade</option>
                  <option value="PERCENT">% da mensalidade</option>
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>O valor incide sobre</Label>
                <select
                  className={selectClass}
                  value={phase.payoutBase}
                  onChange={(e) =>
                    updatePhase(pi, { payoutBase: e.target.value as PayoutBase })
                  }
                >
                  <option value="ALL_ACTIVE">Todas as unidades ativas</option>
                  <option value="REFERRED_THIS_MONTH">
                    Apenas as indicadas naquele mês
                  </option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Faixas</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addBracket(pi)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar faixa
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Ex.: até 10 {noun} → {isPercent ? "5%" : "R$ 100"}; até 30 →{" "}
                {isPercent ? "7%" : "R$ 150"}; acima → {isPercent ? "10%" : "R$ 200"}.
                A última faixa (sem teto) cobre o restante.
              </p>

              <div className="space-y-2">
                {phase.brackets.map((b, bi) => (
                  <div
                    key={bi}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-2"
                  >
                    <span className="text-xs text-gray-500">até</span>
                    {b.upTo === null ? (
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                        sem teto
                      </span>
                    ) : (
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="w-24"
                        value={b.upTo}
                        onChange={(e) =>
                          updateBracket(pi, bi, {
                            upTo: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                      />
                    )}
                    <span className="text-xs text-gray-500">{noun} →</span>
                    <div className="flex items-center gap-1">
                      {!isPercent && <span className="text-xs text-gray-500">R$</span>}
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-28"
                        value={b.value}
                        onChange={(e) =>
                          updateBracket(pi, bi, { value: Number(e.target.value) })
                        }
                      />
                      {isPercent && <span className="text-xs text-gray-500">%</span>}
                    </div>
                    <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={b.upTo === null}
                        onChange={(e) =>
                          updateBracket(pi, bi, { upTo: e.target.checked ? null : 10 })
                        }
                      />
                      sem teto
                    </label>
                    {phase.brackets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBracket(pi, bi)}
                        className="text-gray-400 hover:text-rose-600"
                        aria-label="Remover faixa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {multi && !isLast && phase.durationMonths === null && (
              <p className="text-xs font-medium text-amber-600">
                Só a última fase pode ser “em diante”. Defina uma duração para esta
                fase.
              </p>
            )}
          </div>
        )
      })}

      <Button type="button" variant="outline" size="sm" onClick={addPhase}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar fase no tempo
      </Button>
      <p className="text-xs text-gray-500">
        Use mais de uma fase para mudar a regra ao longo do tempo de cada unidade
        indicada — ex.: nos primeiros 3 meses um valor fixo, depois percentual da
        mensalidade. Cada unidade segue o próprio relógio (a partir da ativação
        dela).
      </p>
    </div>
  )
}

/**
 * Normaliza fases vindas do banco/JSON em drafts. Delega para `parsePlan`
 * (mesma normalizacao/ordenacao/validacao que o MOTOR usa), garantindo que o
 * que o admin edita seja exatamente o que o calculo interpreta. `CommissionPhase`
 * e estruturalmente identico a `PhaseDraft`.
 */
export function phasesFromJson(value: unknown): PhaseDraft[] {
  return parsePlan(value)
}

/**
 * Limpa faixas para o formato exato do zod do servidor (upTo int>=1|null,
 * value>=0), sem ordenar (o servidor reordena via sortBrackets). Compartilhado
 * pelos forms global e por revendedor para nao divergirem.
 */
export function cleanBrackets(brackets: CommissionBracket[]): CommissionBracket[] {
  return brackets.map((b) => ({
    upTo: b.upTo === null ? null : Math.max(1, Math.floor(Number(b.upTo) || 1)),
    value: Math.max(0, Number(b.value) || 0),
  }))
}
