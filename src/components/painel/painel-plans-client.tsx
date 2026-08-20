"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Eye, EyeOff, Star, StarOff } from "lucide-react"

/**
 * Assinaturas na vitrine da unidade.
 *
 * A unidade NAO cria plano nem edita o conteudo: o escopo (categorias, pacote,
 * cursos) e da PMB e vale igual em todas as lojas — o mesmo contrato dos
 * pacotes. O que ela controla e o proprio negocio: preco, se aparece na vitrine
 * dela e se fica em destaque.
 */

interface PlanRow {
  id: string
  name: string
  description: string | null
  suggestedPrice: number
  price: number
  isVisible: boolean
  isFeatured: boolean
  courseCount: number
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function PainelPlansClient({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/painel/assinaturas")
      const body = await res.json()
      if (res.ok) {
        const rows: PlanRow[] = body.data ?? []
        setPlans(rows)
        setDraftPrice(
          Object.fromEntries(
            rows.map((p) => [p.id, String(p.price).replace(".", ",")]),
          ),
        )
      } else {
        setError(body.error ?? "Falha ao carregar")
      }
    } catch {
      setError("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    setSavingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/painel/assinaturas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "Falha ao salvar")
        return
      }
      await load()
    } catch {
      setError("Erro de rede")
    } finally {
      setSavingId(null)
    }
  }

  function savePrice(p: PlanRow) {
    const raw = (draftPrice[p.id] ?? "").replace(",", ".")
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
      setError("Informe um preço maior que zero")
      return
    }
    if (value === p.price) return
    void patch(p.id, { price: value })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Os planos são criados pela Profissionaliza Mais Brasil e valem para
        todas as lojas. Aqui você define <strong>o seu preço</strong> e se cada
        plano aparece na sua vitrine.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {plans.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nenhum plano de assinatura disponível no momento.
        </p>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl border bg-white p-4 ${
                p.isVisible ? "border-gray-200" : "border-dashed border-gray-300 bg-gray-50/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {p.name}
                    {!p.isVisible && (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
                        fora da vitrine
                      </span>
                    )}
                  </p>
                  {p.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{p.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    <strong>{p.courseCount}</strong>{" "}
                    {p.courseCount === 1 ? "curso" : "cursos"} na sua vitrine ·
                    sugerido {money(p.suggestedPrice)}
                  </p>
                </div>

                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => patch(p.id, { isVisible: !p.isVisible })}
                      disabled={savingId === p.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
                    >
                      {p.isVisible ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" />
                          Ocultar
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" />
                          Exibir
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => patch(p.id, { isFeatured: !p.isFeatured })}
                      disabled={savingId === p.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
                    >
                      {p.isFeatured ? (
                        <>
                          <StarOff className="h-3.5 w-3.5" />
                          Tirar destaque
                        </>
                      ) : (
                        <>
                          <Star className="h-3.5 w-3.5" />
                          Destacar
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-xs">
                  <span className="font-medium text-gray-700">
                    Seu preço (mensal)
                  </span>
                  <input
                    value={draftPrice[p.id] ?? ""}
                    onChange={(e) =>
                      setDraftPrice((d) => ({ ...d, [p.id]: e.target.value }))
                    }
                    onBlur={() => canManage && savePrice(p)}
                    disabled={!canManage || savingId === p.id}
                    inputMode="decimal"
                    className="mt-1 w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </label>
                {savingId === p.id && (
                  <Loader2 className="mb-2 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
