"use client"

import { useCallback, useEffect, useState } from "react"
import { Settings2 } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { appDomain } from "@/lib/tenant/urls"
import {
  APRENDIZADO_DEFAULT,
  APRENDIZADO_MAX_ITEMS,
  aprendizadoToText,
  parseAprendizado,
} from "@/lib/courses/aprendizado"
import {
  CategoryManagerDialog,
  type Category,
} from "./category-manager-dialog"

export interface CatalogEditDrawerProps {
  courseId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

interface CourseDetail {
  id: string
  nome: string
  precoOriginal: number | null
  /** Promoção do catálogo; entra na cascata de preço de venda do servidor. */
  precoPromocional: number | null
  precoVitrineMain: number | null
  precoDeVitrineMain: number | null
  destaqueHome: boolean
  ordemHome: number | null
  descricaoOverride: string | null
  aprendizado: string[]
  capaOverride: string | null
  categoriaLoja: string | null
  categoryId: string | null
  category: { id: string; name: string; slug: string } | null
  // M2M: um curso pode estar em varias categorias. `categoryIds` e a fonte de
  // verdade editada na UI (a primeira vira a principal no backend).
  categoryIds: string[]
  categories: { id: string; name: string; slug: string }[]
  status: string
  parcelasSugeridas: number | null
  parcelasOverride: number | null
  hiddenMain: boolean
  paymentTypeMain: "ONE_TIME" | "MONTHLY"
  monthlyMonthsMain: number | null
  visibilityMode: "ALL" | "ALLOWLIST" | "DENYLIST"
  allowedTenantIds: string[]
  blockedTenantIds: string[]
}

interface TenantLookup {
  id: string
  name: string
  slug: string
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "CANCELLED"
}

type Visibility = "all" | "main_only_hidden" | "none"

function visibilityFromDetail(d: CourseDetail): Visibility {
  if (d.status === "INATIVO") return "none"
  if (d.hiddenMain) return "main_only_hidden"
  return "all"
}

export function CatalogEditDrawer({ courseId, open, onOpenChange, onSaved }: CatalogEditDrawerProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [tenants, setTenants] = useState<TenantLookup[]>([])
  const [tenantFilter, setTenantFilter] = useState("")
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  // Texto cru do textarea de "O que vai aprender" (1 item por linha). Mantido
  // fora de `detail` para não perder linhas em branco enquanto o admin digita.
  const [aprendizadoText, setAprendizadoText] = useState("")

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/catalogo/categorias")
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) {
        setCategories(json.data as Category[])
      }
    } catch {
      // Erro silencioso: select fica com a lista atual.
    }
  }, [])

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/catalogo/tenants-lookup")
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) {
        setTenants(json.data as TenantLookup[])
      }
    } catch {
      // Erro silencioso
    }
  }, [])

  useEffect(() => {
    if (!courseId || !open) return
    // Reset síncrono ao trocar de curso evita mostrar dados do curso anterior
    // enquanto o novo carrega. Os 3 setState abaixo são intencionais.
    /* eslint-disable react-hooks/set-state-in-effect */
    setError(null)
    setDetail(null)
    setTenantFilter("")
    /* eslint-enable react-hooks/set-state-in-effect */
    const ctrl = new AbortController()
    fetch(`/api/admin/catalogo/${courseId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((b) => {
        if (b.data) {
          const data = b.data as CourseDetail
          setDetail(data)
          setAprendizadoText(aprendizadoToText(data.aprendizado))
        } else setError(b.error ?? "Falha ao carregar curso")
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError("Erro de rede")
      })
    loadCategories()
    loadTenants()
    return () => ctrl.abort()
  }, [courseId, open, loadCategories, loadTenants])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!detail) return
    setSaving(true)
    setError(null)
    const visibility = visibilityFromDetail(detail)
    const body = {
      precoVitrineMain: detail.precoVitrineMain,
      precoDeVitrineMain: detail.precoDeVitrineMain,
      destaqueHome: detail.destaqueHome,
      ordemHome: detail.ordemHome,
      descricaoOverride: detail.descricaoOverride,
      aprendizado: parseAprendizado(aprendizadoText),
      capaOverride: detail.capaOverride,
      parcelasOverride: detail.parcelasOverride,
      categoriaLoja: detail.categoriaLoja,
      categoryIds: detail.categoryIds,
      status: visibility === "none" ? "INATIVO" : "ATIVO",
      hiddenMain: visibility === "main_only_hidden",
      paymentTypeMain: detail.paymentTypeMain,
      monthlyMonthsMain:
        detail.paymentTypeMain === "MONTHLY"
          ? detail.monthlyMonthsMain ?? 12
          : null,
      visibilityMode: detail.visibilityMode,
      // Envia apenas a lista relevante (zera a outra para evitar lixo)
      allowedTenantIds:
        detail.visibilityMode === "ALLOWLIST" ? detail.allowedTenantIds : [],
      blockedTenantIds:
        detail.visibilityMode === "DENYLIST" ? detail.blockedTenantIds : [],
    }
    const res = await fetch(`/api/admin/catalogo/${detail.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? "Falha ao salvar")
      return
    }
    onSaved()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Editar curso da vitrine PMB</SheetTitle>
          <SheetDescription>
            Estes ajustes aplicam apenas na vitrine principal. Revendedores definem o proprio preco.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-8">
          {!detail && !error ? (
            <div className="mt-8 text-sm text-gray-500">Carregando...</div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {detail ? (
            <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div>
              <label className="text-xs font-semibold text-gray-700">Curso</label>
              <p className="mt-1 text-sm font-medium text-[var(--color-pmb-green-900)]">{detail.nome}</p>
            </div>

            <div>
              <label id="payment-type-label" className="text-xs font-semibold text-gray-700">
                Forma de pagamento
              </label>
              <div
                role="group"
                aria-labelledby="payment-type-label"
                className="mt-1 grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    setDetail({
                      ...detail,
                      paymentTypeMain: "ONE_TIME",
                      monthlyMonthsMain: null,
                    })
                  }
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    detail.paymentTypeMain === "ONE_TIME"
                      ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="font-bold text-[var(--color-pmb-green-900)]">
                    Pagamento único
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    À vista ou parcelado no cartão
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDetail({
                      ...detail,
                      paymentTypeMain: "MONTHLY",
                      monthlyMonthsMain: detail.monthlyMonthsMain ?? 12,
                    })
                  }
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    detail.paymentTypeMain === "MONTHLY"
                      ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="font-bold text-[var(--color-pmb-green-900)]">
                    Mensalidade
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    Cobrança recorrente no mesmo dia
                  </div>
                </button>
              </div>
            </div>

            {detail.paymentTypeMain === "MONTHLY" && (
              <div>
                <label htmlFor="monthly-months" className="text-xs font-semibold text-gray-700">
                  Quantidade de mensalidades
                </label>
                <input
                  id="monthly-months"
                  type="number"
                  min={1}
                  max={60}
                  value={detail.monthlyMonthsMain ?? ""}
                  onChange={(e) =>
                    setDetail({
                      ...detail,
                      monthlyMonthsMain:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ex: 12"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Número de cobranças mensais que o aluno fará. Ex: 12 = um ano de
                  curso.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="preco-vitrine-main" className="text-xs font-semibold text-gray-700">
                {detail.paymentTypeMain === "MONTHLY"
                  ? "Valor da mensalidade (R$)"
                  : "Preço vitrine principal (R$)"}
              </label>
              <input
                id="preco-vitrine-main"
                type="number"
                step="0.01"
                min="0"
                value={detail.precoVitrineMain ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    precoVitrineMain: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                placeholder={detail.precoOriginal ? String(detail.precoOriginal) : "Ex: 197.00"}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {detail.paymentTypeMain === "MONTHLY"
                  ? "Valor cobrado por mês do aluno na vitrine PMB."
                  : "Preço usado na vitrine PMB. Revendedores definem o próprio."}
              </p>
              {detail.paymentTypeMain === "MONTHLY" &&
                detail.precoVitrineMain !== null &&
                detail.monthlyMonthsMain &&
                detail.monthlyMonthsMain > 0 && (
                  <div className="mt-2 rounded-lg border border-[rgba(2,89,24,0.15)] bg-[var(--color-pmb-lime-50)]/40 px-3 py-2 text-xs text-[var(--color-pmb-green-900)]">
                    <strong>{detail.monthlyMonthsMain}</strong>{" "}
                    {detail.monthlyMonthsMain === 1
                      ? "mensalidade"
                      : "mensalidades"}{" "}
                    de{" "}
                    <strong className="font-mono">
                      {detail.precoVitrineMain.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </strong>
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      Total ao final:{" "}
                      <span className="font-mono">
                        {(
                          detail.precoVitrineMain * detail.monthlyMonthsMain
                        ).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    </div>
                  </div>
                )}
            </div>

            <div>
              <label htmlFor="preco-de-vitrine-main" className="text-xs font-semibold text-gray-700">
                Preço de tabela — o &quot;De R$&quot; riscado (R$)
              </label>
              <input
                id="preco-de-vitrine-main"
                type="number"
                step="0.01"
                min="0"
                value={detail.precoDeVitrineMain ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    // Vazio e 0 significam a mesma coisa: sem "De".
                    precoDeVitrineMain: Number(e.target.value) || null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                placeholder="Deixe vazio para não exibir &quot;De&quot;"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Aparece riscado antes do preço de venda na vitrine PMB. Precisa
                ser <strong>maior</strong> que o preço acima. Vazio = a vitrine
                mostra só o preço de venda.
              </p>
              {(() => {
                const de = detail.precoDeVitrineMain
                // MESMA cascata do PATCH (`precoVitrineMain ?? precoPromocional
                // ?? precoOriginal`, com `||` para tratar 0 como ausente).
                // Sem `precoPromocional` o aviso divergia do servidor: a gaveta
                // dizia "14% OFF" e o salvar voltava COMPARE_AT_NOT_GREATER.
                const venda =
                  Number(detail.precoVitrineMain ?? 0) ||
                  Number(detail.precoPromocional ?? 0) ||
                  Number(detail.precoOriginal ?? 0)
                if (de == null || venda <= 0) return null
                if (de <= venda) {
                  return (
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                      Precisa ser maior que {venda.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })} — do contrário a vitrine não exibe o &quot;De&quot;.
                    </p>
                  )
                }
                const off = Math.round(((de - venda) / de) * 100)
                return (
                  <p className="mt-1.5 text-[11px] text-[var(--color-pmb-green-900)]">
                    Vitrine exibe{" "}
                    <span className="line-through">
                      {de.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>{" "}
                    →{" "}
                    <strong className="font-mono">
                      {venda.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>{" "}
                    ({off}% OFF)
                  </p>
                )
              })()}
            </div>

            <div className="flex items-center gap-3">
              <input
                id="destaque-home"
                type="checkbox"
                checked={detail.destaqueHome}
                onChange={(e) => setDetail({ ...detail, destaqueHome: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="destaque-home" className="text-sm text-gray-700">
                Destaque na home
              </label>
            </div>

            <div>
              <label htmlFor="ordem-home" className="text-xs font-semibold text-gray-700">Ordem na home</label>
              <input
                id="ordem-home"
                type="number"
                value={detail.ordemHome ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, ordemHome: e.target.value === "" ? null : Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: 1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">
                  Categorias
                </label>
                <button
                  type="button"
                  onClick={() => setCategoryDialogOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-pmb-green)] hover:underline"
                >
                  <Settings2 className="h-3 w-3" />
                  Gerenciar categorias
                </button>
              </div>
              <CategoryMultiPicker
                categories={categories}
                selected={detail.categoryIds}
                onChange={(next) => setDetail({ ...detail, categoryIds: next })}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                O curso pode aparecer em várias categorias. A primeira marcada é
                tratada como a principal.
              </p>
              {detail.categoriaLoja && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Categoria original do sync:{" "}
                  <span className="font-mono">{detail.categoriaLoja}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="capa-override" className="text-xs font-semibold text-gray-700">Capa (URL Supabase)</label>
              <input
                id="capa-override"
                type="url"
                value={detail.capaOverride ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, capaOverride: e.target.value === "" ? null : e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>

            <div>
              <label htmlFor="descricao-override" className="text-xs font-semibold text-gray-700">Descricao override</label>
              <textarea
                id="descricao-override"
                rows={4}
                value={detail.descricaoOverride ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    descricaoOverride: e.target.value === "" ? null : e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="aprendizado" className="text-xs font-semibold text-gray-700">
                O que voce vai aprender — 1 item por linha (max {APRENDIZADO_MAX_ITEMS})
              </label>
              <textarea
                id="aprendizado"
                rows={6}
                value={aprendizadoText}
                onChange={(e) => setAprendizadoText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder={APRENDIZADO_DEFAULT.join("\n")}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Vira o PADRAO deste curso em todas as vitrines (PMB e revendas).
                Cada revenda pode sobrescrever na vitrine dela. Em branco = texto
                generico.
              </p>
            </div>

            {detail.paymentTypeMain === "ONE_TIME" && (
            <div>
              <label htmlFor="parcelas-override" className="text-xs font-semibold text-gray-700">
                Parcelas (override) — vazio usa o padrão importado
                {detail.parcelasSugeridas
                  ? ` (${detail.parcelasSugeridas}x)`
                  : ""}
              </label>
              <input
                id="parcelas-override"
                type="number"
                min={1}
                max={24}
                value={detail.parcelasOverride ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    parcelasOverride:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder={
                  detail.parcelasSugeridas
                    ? String(detail.parcelasSugeridas)
                    : "Ex: 12"
                }
              />
            </div>
            )}

            <fieldset className="rounded-lg border border-gray-200 p-4">
              <legend className="px-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                Visibilidade
              </legend>
              <div className="space-y-2.5">
                <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="visibility"
                    className="mt-0.5"
                    checked={visibilityFromDetail(detail) === "all"}
                    onChange={() =>
                      setDetail({ ...detail, status: "ATIVO", hiddenMain: false })
                    }
                  />
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      Visível em todas as vitrines
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Aparece na vitrine principal e em todos os revendedores que
                      não ocultaram individualmente.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="visibility"
                    className="mt-0.5"
                    checked={visibilityFromDetail(detail) === "main_only_hidden"}
                    onChange={() =>
                      setDetail({ ...detail, status: "ATIVO", hiddenMain: true })
                    }
                  />
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                      Ocultar só na vitrine principal
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Some apenas em www.{appDomain()}. Revendedores continuam
                      vendendo normalmente.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="visibility"
                    className="mt-0.5"
                    checked={visibilityFromDetail(detail) === "none"}
                    onChange={() =>
                      setDetail({ ...detail, status: "INATIVO", hiddenMain: false })
                    }
                  />
                  <div>
                    <div className="text-sm font-semibold text-rose-700">
                      Ocultar em todas as vitrines
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Marca o curso como INATIVO. Some da vitrine principal e de
                      todos os revendedores.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>

            {detail.status === "ATIVO" && (
              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                  Visibilidade nas revendas
                </legend>
                <div className="space-y-2.5">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="visibility-mode"
                      className="mt-0.5"
                      checked={detail.visibilityMode === "ALL"}
                      onChange={() =>
                        setDetail({ ...detail, visibilityMode: "ALL" })
                      }
                    />
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                        Mostrar para todas as revendas
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Comportamento padrão. Todos os revendedores ativos podem
                        listar este curso na vitrine deles.
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="visibility-mode"
                      className="mt-0.5"
                      checked={detail.visibilityMode === "ALLOWLIST"}
                      onChange={() =>
                        setDetail({ ...detail, visibilityMode: "ALLOWLIST" })
                      }
                    />
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                        Ocultar para todas EXCETO as selecionadas
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Curso exclusivo: só aparece nas revendas marcadas
                        abaixo.
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="visibility-mode"
                      className="mt-0.5"
                      checked={detail.visibilityMode === "DENYLIST"}
                      onChange={() =>
                        setDetail({ ...detail, visibilityMode: "DENYLIST" })
                      }
                    />
                    <div>
                      <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                        Mostrar para todas EXCETO as selecionadas
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Todos os revendedores listam, exceto os marcados abaixo.
                      </div>
                    </div>
                  </label>
                </div>

                {detail.visibilityMode !== "ALL" && (
                  <TenantPicker
                    tenants={tenants}
                    selected={
                      detail.visibilityMode === "ALLOWLIST"
                        ? detail.allowedTenantIds
                        : detail.blockedTenantIds
                    }
                    onChange={(next) =>
                      setDetail(
                        detail.visibilityMode === "ALLOWLIST"
                          ? { ...detail, allowedTenantIds: next }
                          : { ...detail, blockedTenantIds: next },
                      )
                    }
                    filter={tenantFilter}
                    onFilterChange={setTenantFilter}
                    mode={detail.visibilityMode}
                  />
                )}
              </fieldset>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
          ) : null}
        </div>
      </SheetContent>

      <CategoryManagerDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onChanged={() => {
          loadCategories()
        }}
      />
    </Sheet>
  )
}

interface CategoryMultiPickerProps {
  categories: Category[]
  /** Ordem importa: o primeiro id e a categoria principal. */
  selected: string[]
  onChange: (next: string[]) => void
}

function CategoryMultiPicker({
  categories,
  selected,
  onChange,
}: CategoryMultiPickerProps) {
  const selectedSet = new Set(selected)

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      // Anexa ao final: preserva qual foi marcada primeiro (= principal).
      onChange([...selected, id])
    }
  }

  return (
    <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
          {selected.length === 0
            ? "Nenhuma categoria"
            : `${selected.length} selecionada${selected.length > 1 ? "s" : ""}`}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-gray-500 hover:text-rose-600 hover:underline"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {categories.length === 0 ? (
          <p className="p-3 text-center text-[11px] text-gray-500">
            Nenhuma categoria cadastrada
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {categories.map((cat) => {
              const checked = selectedSet.has(cat.id)
              const isPrimary = selected[0] === cat.id
              return (
                <li key={cat.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(cat.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span className="flex-1 truncate text-[var(--color-pmb-green-900)]">
                      {cat.name}
                      {!cat.isActive ? (
                        <span className="ml-1 text-[10px] text-gray-400">
                          (inativa)
                        </span>
                      ) : null}
                    </span>
                    {isPrimary && (
                      <span className="rounded bg-[var(--color-pmb-lime-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-pmb-green)]">
                        principal
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

interface TenantPickerProps {
  tenants: TenantLookup[]
  selected: string[]
  onChange: (next: string[]) => void
  filter: string
  onFilterChange: (q: string) => void
  mode: "ALLOWLIST" | "DENYLIST"
}

function TenantPicker({
  tenants,
  selected,
  onChange,
  filter,
  onFilterChange,
  mode,
}: TenantPickerProps) {
  const selectedSet = new Set(selected)
  const filterLower = filter.trim().toLowerCase()
  const filtered = filterLower
    ? tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(filterLower) ||
          t.slug.toLowerCase().includes(filterLower),
      )
    : tenants

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const placeholderText =
    mode === "ALLOWLIST"
      ? "Nenhuma revenda selecionada — o curso ficará oculto para TODOS"
      : "Nenhuma revenda selecionada — comportamento equivale a 'Mostrar para todas'"

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
          Revendas {mode === "ALLOWLIST" ? "permitidas" : "bloqueadas"} (
          {selected.length})
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-gray-500 hover:text-rose-600 hover:underline"
          >
            Limpar
          </button>
        )}
      </div>

      <input
        type="search"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Buscar revenda pelo nome ou slug…"
        className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[var(--color-pmb-green)] focus:outline-none"
      />

      <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <p className="p-3 text-center text-[11px] text-gray-500">
            {tenants.length === 0
              ? "Nenhuma revenda cadastrada"
              : "Nenhuma revenda corresponde ao filtro"}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const checked = selectedSet.has(t.id)
              return (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(t.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="flex-1 truncate font-medium text-[var(--color-pmb-green-900)]">
                      {t.name}
                    </span>
                    <span className="text-[10px] uppercase text-gray-400">
                      {t.slug}
                    </span>
                    {t.status !== "ACTIVE" && (
                      <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] uppercase text-gray-500">
                        {t.status === "PENDING" ? "pend." : "susp."}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {selected.length === 0 && (
        <p className="mt-2 text-[11px] italic text-gray-500">{placeholderText}</p>
      )}
    </div>
  )
}
