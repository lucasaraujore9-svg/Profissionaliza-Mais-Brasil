"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Pencil } from "lucide-react"
import { SUBSCRIPTION_SCOPES, scopeIsComplete } from "@/lib/subscriptions/schema"
import {
  SUBSCRIPTION_INTERVALS,
  INTERVAL_LABEL,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PRICE_SUFFIX,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"

/**
 * CRUD dos planos de assinatura da PMB.
 *
 * O seletor de escopo é o coração da tela: `ALL` e `CATEGORY` são DINÂMICOS —
 * curso publicado depois entra sozinho no plano. A contagem exibida é a de
 * agora, e o texto diz isso, para ninguém achar que a lista está congelada.
 */

interface Plan {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  interval: SubscriptionIntervalValue
  scope: (typeof SUBSCRIPTION_SCOPES)[number]
  categoryIds: string[]
  packageId: string | null
  courseIds: string[]
  featured: boolean
  enabled: boolean
  position: number
  courseCount: number
}

interface Option {
  id: string
  name: string
}

const SCOPE_LABEL: Record<(typeof SUBSCRIPTION_SCOPES)[number], string> = {
  ALL: "Todos os cursos do catálogo",
  CATEGORY: "Uma ou mais categorias",
  PACKAGE: "Os cursos de um pacote",
  COURSES: "Uma lista fixa de cursos",
}

const SCOPE_HINT: Record<(typeof SUBSCRIPTION_SCOPES)[number], string> = {
  ALL: "Curso novo publicado no catálogo entra automaticamente para quem já assina.",
  CATEGORY:
    "Curso novo publicado nessas categorias entra automaticamente para quem já assina.",
  PACKAGE:
    "Curso adicionado ao pacote depois entra automaticamente para quem já assina.",
  COURSES: "Lista fixa: só os cursos marcados aqui, e nada mais.",
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
  scope: (typeof SUBSCRIPTION_SCOPES)[number]
  categoryIds: string[]
  packageId: string
  courseIds: string[]
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
  courseIds: [],
  featured: false,
  enabled: true,
}

export function AdminPlansClient({
  canEdit,
  categories,
  packages,
}: {
  canEdit: boolean
  categories: Option[]
  packages: Option[]
}) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/assinaturas")
      const body = await res.json()
      if (res.ok) setPlans(body.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
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
        courseIds: form.courseIds,
        featured: form.featured,
        enabled: form.enabled,
      }
      const res = await fetch(
        form.id ? `/api/admin/assinaturas/${form.id}` : "/api/admin/assinaturas",
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
    const res = await fetch(`/api/admin/assinaturas/${id}`, { method: "DELETE" })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 409 = tem assinante vivo. A mensagem do servidor já explica o caminho
      // (desativar em vez de excluir); mostrá-la é melhor que um erro genérico.
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
        courseIds: form.courseIds,
      })
    : true

  return (
    <div className="space-y-6">
      {canEdit && !form && (
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {/* O rótulo do campo muda com a periodicidade porque "R$ 490" é
                  uma coisa por mês e outra por ano — e no vitalício não é
                  "mensalidade" nenhuma. */}
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
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {SUBSCRIPTION_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {INTERVAL_LABEL[i]}
                </option>
              ))}
            </select>
            {form.interval === "LIFETIME" ? (
              <span className="mt-1 block text-xs text-gray-500">
                Cobrança única. O aluno paga uma vez e mantém o acesso ao
                conteúdo do plano para sempre — não há renovação nem
                cancelamento por falta de pagamento.
              </span>
            ) : (
              <span className="mt-1 block text-xs text-gray-500">
                Renova automaticamente até o aluno cancelar.
              </span>
            )}
            {form.id && (
              // Sem este aviso, editar a periodicidade parece alcançar quem já
              // assina — e não alcança: `StudentSubscription.interval` é
              // congelado na compra, junto com o preço.
              <span className="mt-1 block text-xs text-amber-700">
                Alterar a periodicidade vale só para novas contratações. Quem já
                assina continua no ciclo e no valor que contratou.
              </span>
            )}
          </label>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-gray-700">Descrição</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-gray-700">
              O que o plano libera
            </legend>
            <div className="mt-2 space-y-2">
              {SUBSCRIPTION_SCOPES.map((sc) => (
                <label key={sc} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="scope"
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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

          {form.scope === "COURSES" && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A seleção de cursos avulsos ainda não está nesta tela. Use um
              pacote ou categorias por enquanto.
            </p>
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
              onClick={save}
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

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : plans.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nenhum plano criado ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {p.name}
                  {!p.enabled && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                      inativo
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {money(p.price)}
                  {INTERVAL_PRICE_SUFFIX[p.interval]} · {INTERVAL_LABEL[p.interval]} ·{" "}
                  {SCOPE_LABEL[p.scope]} ·{" "}
                  <strong>{p.courseCount}</strong> cursos hoje
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
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
                        courseIds: p.courseIds,
                        featured: p.featured,
                        enabled: p.enabled,
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
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
