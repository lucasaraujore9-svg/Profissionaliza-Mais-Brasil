"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Eye, EyeOff, Star, StarOff, Plus, Pencil, Trash2 } from "lucide-react"
import { SUBSCRIPTION_SCOPES, scopeIsComplete } from "@/lib/subscriptions/schema"
import {
  SUBSCRIPTION_INTERVALS,
  INTERVAL_LABEL,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PRICE_SUFFIX,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"

/**
 * Assinaturas da vitrine da unidade.
 *
 * Duas origens com poderes diferentes, e a tela precisa deixar isso obvio:
 *
 *  - **Seu plano**: a unidade cria, edita e exclui. Aparece SO na vitrine dela.
 *  - **Plano da PMB**: distribuido a toda a rede. Ela ajusta preco,
 *    visibilidade e destaque — o conteudo e da PMB e vale igual em todas as
 *    lojas, entao editar aqui mudaria o produto da rede inteira.
 *
 * E o mesmo contrato dos pacotes; a diferenca de poder e mostrada com um selo,
 * nao escondida atras de um botao que da erro.
 */

type Origin = "OWN" | "PMB"
type Scope = (typeof SUBSCRIPTION_SCOPES)[number]

interface PlanRow {
  id: string
  origin: Origin
  name: string
  description: string | null
  suggestedPrice: number
  price: number
  interval: SubscriptionIntervalValue
  isVisible: boolean
  isFeatured: boolean
  scope: Scope
  categoryIds: string[]
  packageId: string | null
  courseIds: string[]
  courseCount: number
}

interface Option {
  id: string
  name: string
}

const SCOPE_LABEL: Record<Scope, string> = {
  ALL: "Todos os cursos da minha vitrine",
  CATEGORY: "Uma ou mais categorias",
  PACKAGE: "Os cursos de um pacote",
  COURSES: "Uma lista fixa de cursos",
}

const SCOPE_HINT: Record<Scope, string> = {
  ALL: "Curso novo que entrar na sua vitrine passa a valer automaticamente para quem já assina.",
  CATEGORY:
    "Curso novo dessas categorias passa a valer automaticamente para quem já assina.",
  PACKAGE: "Curso adicionado ao pacote depois passa a valer para quem já assina.",
  COURSES: "Lista fixa: só os cursos marcados, e nada mais.",
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface FormState {
  id: string | null
  name: string
  description: string
  price: string
  interval: SubscriptionIntervalValue
  scope: Scope
  categoryIds: string[]
  packageId: string
  featured: boolean
  enabled: boolean
}

const EMPTY: FormState = {
  id: null,
  name: "",
  description: "",
  price: "",
  interval: "MONTHLY",
  scope: "ALL",
  categoryIds: [],
  packageId: "",
  featured: false,
  enabled: true,
}

export function PainelPlansClient({
  canManage,
  categories,
  packages,
}: {
  canManage: boolean
  categories: Option[]
  packages: Option[]
}) {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

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

  async function saveForm() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const price = Number(form.price.replace(",", "."))
      const payload = {
        name: form.name,
        description: form.description || null,
        price,
        interval: form.interval,
        scope: form.scope,
        categoryIds: form.categoryIds,
        packageId: form.packageId || null,
        courseIds: [],
        featured: form.featured,
        enabled: form.enabled,
      }
      const res = await fetch(
        form.id ? `/api/painel/assinaturas/${form.id}` : "/api/painel/assinaturas",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar")
        return
      }
      setForm(null)
      await load()
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setError(null)
    const res = await fetch(`/api/painel/assinaturas/${id}`, { method: "DELETE" })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? "Falha ao excluir")
      return
    }
    await load()
  }

  const scopeComplete = form
    ? scopeIsComplete({
        scope: form.scope,
        categoryIds: form.categoryIds,
        packageId: form.packageId || null,
        courseIds: [],
      })
    : true

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  const field =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Você pode <strong>criar seus próprios planos</strong>, que aparecem
        apenas na sua vitrine. Os planos da Profissionaliza Mais Brasil chegam
        prontos para toda a rede — neles você ajusta o preço e se aparecem na
        sua loja.
      </p>

      {canManage && !form && (
        <button
          type="button"
          onClick={() => setForm(EMPTY)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Novo plano
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {form && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {form.id ? "Editar plano" : "Novo plano"}
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium text-gray-700">Nome</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={field}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                {form.interval === "LIFETIME"
                  ? "Valor único (R$)"
                  : "Valor por cobrança (R$)"}
              </span>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                inputMode="decimal"
                placeholder="49,90"
                className={field}
              />
              <span className="mt-1 block text-xs text-gray-500">
                {INTERVAL_CHARGE_LABEL[form.interval]}
              </span>
            </label>
          </div>

          <label className="mt-4 block text-sm sm:w-1/2 sm:pr-2">
            <span className="font-medium text-gray-700">Periodicidade</span>
            <select
              value={form.interval}
              onChange={(e) =>
                setForm({
                  ...form,
                  interval: e.target.value as SubscriptionIntervalValue,
                })
              }
              className={field}
            >
              {SUBSCRIPTION_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {INTERVAL_LABEL[i]}
                </option>
              ))}
            </select>
            {form.interval === "LIFETIME" ? (
              <span className="mt-1 block text-xs text-gray-500">
                Cobrança única: o aluno paga uma vez e mantém o acesso ao
                conteúdo do plano para sempre.
              </span>
            ) : (
              <span className="mt-1 block text-xs text-gray-500">
                Renova automaticamente até o aluno cancelar.
              </span>
            )}
            {form.id && (
              <span className="mt-1 block text-xs text-amber-700">
                Vale só para novas contratações — quem já assina continua no
                ciclo e no valor que contratou.
              </span>
            )}
          </label>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-gray-700">Descrição</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className={field}
            />
          </label>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-gray-700">
              O que o plano libera
            </legend>
            <div className="mt-2 space-y-2">
              {SUBSCRIPTION_SCOPES.filter((sc) => sc !== "COURSES").map((sc) => (
                <label key={sc} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="painel-scope"
                    checked={form.scope === sc}
                    onChange={() => setForm({ ...form, scope: sc })}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-gray-800">
                      {SCOPE_LABEL[sc]}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {SCOPE_HINT[sc]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {form.scope === "CATEGORY" && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700">Categorias</p>
              <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(c.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          categoryIds: e.target.checked
                            ? [...form.categoryIds, c.id]
                            : form.categoryIds.filter((x) => x !== c.id),
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.scope === "PACKAGE" && (
            <label className="mt-4 block text-sm">
              <span className="font-medium text-gray-700">Pacote</span>
              <select
                value={form.packageId}
                onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                className={field}
              >
                <option value="">Selecione…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-5 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              />
              Destacar como &quot;mais popular&quot;
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Ativo na vitrine
            </label>
          </div>

          {!scopeComplete && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Selecione o conteúdo do plano. Um plano sem conteúdo não libera
              curso nenhum — e o aluno pagaria por um catálogo vazio.
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={saveForm}
              disabled={saving || !scopeComplete || !form.name || !form.price}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nenhum plano de assinatura ainda. Crie o seu ou aguarde os planos da
          Profissionaliza Mais Brasil.
        </p>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => {
            const own = p.origin === "OWN"
            return (
              <li
                key={p.id}
                className={`rounded-xl border bg-white p-4 ${
                  p.isVisible
                    ? "border-gray-200"
                    : "border-dashed border-gray-300 bg-gray-50/60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      {p.name}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          own
                            ? "bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green-900)]"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {own ? "Seu plano" : "Da PMB"}
                      </span>
                      {!p.isVisible && (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
                          fora da vitrine
                        </span>
                      )}
                    </p>
                    {p.description && (
                      <p className="mt-0.5 text-xs text-gray-500">{p.description}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {INTERVAL_LABEL[p.interval]} · {SCOPE_LABEL[p.scope]} ·{" "}
                      <strong>{p.courseCount}</strong>{" "}
                      {p.courseCount === 1 ? "curso" : "cursos"} na sua vitrine
                      {!own && (
                        <>
                          {" "}
                          · sugerido {money(p.suggestedPrice)}
                          {INTERVAL_PRICE_SUFFIX[p.interval]}
                        </>
                      )}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          own
                            ? patch(p.id, { enabled: !p.isVisible })
                            : patch(p.id, { isVisible: !p.isVisible })
                        }
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
                      {own && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                id: p.id,
                                name: p.name,
                                description: p.description ?? "",
                                price: String(p.price).replace(".", ","),
                                interval: p.interval,
                                scope: p.scope,
                                categoryIds: p.categoryIds,
                                packageId: p.packageId ?? "",
                                featured: p.isFeatured,
                                enabled: p.isVisible,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </>
                      )}
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
            )
          })}
        </ul>
      )}
    </div>
  )
}
