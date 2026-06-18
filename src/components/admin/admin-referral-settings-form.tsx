"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CommissionBracket } from "@/lib/referrals/rules"

type CommissionMode = "PER_PAYMENT_PERCENT" | "MONTHLY_TIERED"
type BracketBasis = "NEW_REFERRALS_MONTH" | "ACTIVE_UNITS"
type RateType = "FIXED" | "PERCENT"
type PayoutBase = "ALL_ACTIVE" | "REFERRED_THIS_MONTH"

interface InitialValues {
  referralEnabled: boolean
  defaultReferralPercent: number
  referralMinPayout: number
  referralPayoutDay: number
  commissionMode: CommissionMode
  commissionBracketBasis: BracketBasis
  commissionRateType: RateType
  commissionPayoutBase: PayoutBase
  commissionBrackets: CommissionBracket[]
}

const selectClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

export function AdminReferralSettingsForm({
  initial,
}: {
  initial: InitialValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<InitialValues>({
    ...initial,
    commissionBrackets:
      initial.commissionBrackets.length > 0
        ? initial.commissionBrackets
        : [{ upTo: 10, value: 0 }],
  })

  const isMonthly = form.commissionMode === "MONTHLY_TIERED"
  const isPercent = form.commissionRateType === "PERCENT"
  const basisNoun =
    form.commissionBracketBasis === "NEW_REFERRALS_MONTH"
      ? "indicações no mês"
      : "unidades ativas"

  function updateBracket(i: number, patch: Partial<CommissionBracket>) {
    setForm((f) => ({
      ...f,
      commissionBrackets: f.commissionBrackets.map((b, idx) =>
        idx === i ? { ...b, ...patch } : b,
      ),
    }))
  }
  function addBracket() {
    setForm((f) =>
      f.commissionBrackets.length >= 20
        ? f
        : {
            ...f,
            commissionBrackets: [
              ...f.commissionBrackets,
              { upTo: null, value: 0 },
            ],
          },
    )
  }
  function removeBracket(i: number) {
    setForm((f) => ({
      ...f,
      commissionBrackets: f.commissionBrackets.filter((_, idx) => idx !== i),
    }))
  }

  function submit() {
    if (form.defaultReferralPercent < 0 || form.defaultReferralPercent > 100) {
      toast.error("O percentual deve estar entre 0 e 100")
      return
    }
    if (form.referralMinPayout < 0 || form.referralMinPayout > 100000) {
      toast.error("Saque mínimo deve estar entre R$ 0 e R$ 100.000")
      return
    }
    if (form.referralPayoutDay < 1 || form.referralPayoutDay > 20) {
      toast.error("Dia do payout deve estar entre 1 e 20")
      return
    }
    if (isMonthly) {
      if (form.commissionBrackets.length === 0) {
        toast.error("Adicione pelo menos uma faixa de comissão")
        return
      }
      if (form.commissionBrackets.filter((b) => b.upTo === null).length > 1) {
        toast.error("Apenas uma faixa pode ser 'sem teto'")
        return
      }
      for (const b of form.commissionBrackets) {
        if (b.value < 0) {
          toast.error("Valores de faixa não podem ser negativos")
          return
        }
      }
    }

    // Normaliza as faixas para SEMPRE satisfazer o zod do servidor
    // (upTo: int>=1 | null) mesmo se o usuário voltou ao modo legado com
    // faixas órfãs/inválidas no estado — senão o save trava com 400.
    const cleanBrackets = form.commissionBrackets.map((b) => ({
      upTo: b.upTo === null ? null : Math.max(1, Math.floor(Number(b.upTo) || 1)),
      value: Number(b.value) || 0,
    }))
    const payload = { ...form, commissionBrackets: cleanBrackets }

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
      toast.success("Configurações atualizadas")
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
              checked={form.referralEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, referralEnabled: e.target.checked }))
              }
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
          <Label>Dia do payout mensal (1-20)</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.referralPayoutDay}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                referralPayoutDay: Number(e.target.value),
              }))
            }
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
            override próprio na tela do revendedor.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Modelo de comissão</Label>
          <select
            className={selectClass}
            value={form.commissionMode}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                commissionMode: e.target.value as CommissionMode,
              }))
            }
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
              value={form.defaultReferralPercent}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  defaultReferralPercent: Number(e.target.value),
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Aplicado aos indicadores sem override individual.
            </p>
          </div>
        ) : (
          <div className="space-y-5 rounded-lg border border-[var(--color-pmb-green-900)]/15 bg-[var(--color-pmb-green-900)]/5 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>A faixa é definida por</Label>
                <select
                  className={selectClass}
                  value={form.commissionBracketBasis}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      commissionBracketBasis: e.target.value as BracketBasis,
                    }))
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
                  value={form.commissionRateType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      commissionRateType: e.target.value as RateType,
                    }))
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
                  value={form.commissionPayoutBase}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      commissionPayoutBase: e.target.value as PayoutBase,
                    }))
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
                  onClick={addBracket}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar faixa
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Ex.: até 10 {basisNoun} → {isPercent ? "5%" : "R$ 100"}; até 30 →{" "}
                {isPercent ? "7%" : "R$ 150"}; acima → {isPercent ? "10%" : "R$ 200"}.
                A última faixa (sem teto) cobre o restante.
              </p>

              <div className="space-y-2">
                {form.commissionBrackets.map((b, i) => (
                  <div
                    key={i}
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
                          updateBracket(i, {
                            upTo: Math.max(
                              1,
                              Math.floor(Number(e.target.value) || 1),
                            ),
                          })
                        }
                      />
                    )}
                    <span className="text-xs text-gray-500">{basisNoun} →</span>
                    <div className="flex items-center gap-1">
                      {!isPercent && (
                        <span className="text-xs text-gray-500">R$</span>
                      )}
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-28"
                        value={b.value}
                        onChange={(e) =>
                          updateBracket(i, { value: Number(e.target.value) })
                        }
                      />
                      {isPercent && (
                        <span className="text-xs text-gray-500">%</span>
                      )}
                    </div>
                    <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={b.upTo === null}
                        onChange={(e) =>
                          updateBracket(i, {
                            upTo: e.target.checked ? null : 10,
                          })
                        }
                      />
                      sem teto
                    </label>
                    <button
                      type="button"
                      onClick={() => removeBracket(i)}
                      className="text-gray-400 hover:text-rose-600"
                      aria-label="Remover faixa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  )
}
