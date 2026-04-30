"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

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
  precoVitrineMain: number | null
  destaqueHome: boolean
  ordemHome: number | null
  descricaoOverride: string | null
  capaOverride: string | null
  categoriaLoja: string | null
  status: string
  parcelasSugeridas: number | null
  parcelasOverride: number | null
  hiddenMain: boolean
  paymentTypeMain: "ONE_TIME" | "MONTHLY"
  monthlyMonthsMain: number | null
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

  useEffect(() => {
    if (!courseId || !open) return
    setError(null)
    setDetail(null)
    fetch(`/api/admin/catalogo/${courseId}`)
      .then((r) => r.json())
      .then((b) => {
        if (b.data) setDetail(b.data as CourseDetail)
        else setError(b.error ?? "Falha ao carregar curso")
      })
      .catch(() => setError("Erro de rede"))
  }, [courseId, open])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!detail) return
    setSaving(true)
    setError(null)
    const visibility = visibilityFromDetail(detail)
    const body = {
      precoVitrineMain: detail.precoVitrineMain,
      destaqueHome: detail.destaqueHome,
      ordemHome: detail.ordemHome,
      descricaoOverride: detail.descricaoOverride,
      capaOverride: detail.capaOverride,
      parcelasOverride: detail.parcelasOverride,
      categoriaLoja: detail.categoriaLoja,
      status: visibility === "none" ? "INATIVO" : "ATIVO",
      hiddenMain: visibility === "main_only_hidden",
      paymentTypeMain: detail.paymentTypeMain,
      monthlyMonthsMain:
        detail.paymentTypeMain === "MONTHLY"
          ? detail.monthlyMonthsMain ?? 12
          : null,
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
              <label className="text-xs font-semibold text-gray-700">
                Forma de pagamento
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
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
                <label className="text-xs font-semibold text-gray-700">
                  Quantidade de mensalidades
                </label>
                <input
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
              <label className="text-xs font-semibold text-gray-700">
                {detail.paymentTypeMain === "MONTHLY"
                  ? "Valor da mensalidade (R$)"
                  : "Preço vitrine principal (R$)"}
              </label>
              <input
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
              <label className="text-xs font-semibold text-gray-700">Ordem na home</label>
              <input
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
              <label className="text-xs font-semibold text-gray-700">Categoria loja</label>
              <input
                type="text"
                value={detail.categoriaLoja ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, categoriaLoja: e.target.value === "" ? null : e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Capa (URL Supabase)</label>
              <input
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
              <label className="text-xs font-semibold text-gray-700">Descricao override</label>
              <textarea
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

            {detail.paymentTypeMain === "ONE_TIME" && (
            <div>
              <label className="text-xs font-semibold text-gray-700">
                Parcelas (override) — vazio usa o padrão importado
                {detail.parcelasSugeridas
                  ? ` (${detail.parcelasSugeridas}x)`
                  : ""}
              </label>
              <input
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
                      Some apenas em www.profissionalizamaisbrasil.com.br.
                      Revendedores continuam vendendo normalmente.
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
    </Sheet>
  )
}
