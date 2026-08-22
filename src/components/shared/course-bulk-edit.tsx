"use client"

import { useEffect, useMemo, useState } from "react"
import { Info, Loader2, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resolveAprendizado } from "@/lib/courses/aprendizado"
import {
  buildBulkItems,
  draftFromRow,
  formatPrice,
  parsePrice,
  type RowDraft,
} from "@/lib/courses/bulk-edit"

interface BulkRow {
  id: string
  title: string
  price: number
  precoDe: number | null
  paymentType: "ONE_TIME" | "MONTHLY"
  customParcelas: number | null
  defaultParcelas: number | null
  customDescription: string | null
  defaultDescription: string | null
  customAprendizado: string[]
  defaultAprendizado: string[]
}

interface CourseBulkEditProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Base do endpoint que expõe GET (lista enxuta) e PUT (lote). */
  endpoint: string
  title?: string
  subtitle?: string
  /** Texto do aviso sobre parcelas / escopo das alterações. */
  scopeNote?: React.ReactNode
}

export function CourseBulkEdit({
  open,
  onClose,
  onSaved,
  endpoint,
  title = "Edição em massa",
  subtitle = "Edite preço, descrição e o que o aluno vai aprender em vários cursos de uma vez.",
  scopeNote,
}: CourseBulkEditProps) {
  const [rows, setRows] = useState<BulkRow[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkPrice, setBulkPrice] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    setBulkPrice("")
    fetch(endpoint)
      .then(async (res) => {
        if (!active) return
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar cursos")
          return
        }
        const data = body.data as BulkRow[]
        setRows(data)
        setDrafts(
          Object.fromEntries(data.map((r) => [r.id, draftFromRow(r)])),
        )
      })
      .catch(() => {
        if (active) setError("Erro de rede ao carregar cursos")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, endpoint])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  /** Aplica o mesmo preço a todos os cursos carregados na planilha. */
  const applyPriceToAll = () => {
    if (!rows) return
    const numeric = parsePrice(bulkPrice)
    if (Number.isNaN(numeric) || numeric <= 0) {
      setError("Informe um preço válido para aplicar a todos os cursos.")
      return
    }
    const formatted = formatPrice(numeric)
    setDrafts((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        next[row.id] = { ...next[row.id], price: formatted }
      }
      return next
    })
    setError(null)
  }

  /** Linhas com alguma alteração em relação ao valor original. */
  const changedIds = useMemo(() => {
    if (!rows) return new Set<string>()
    const set = new Set<string>()
    for (const row of rows) {
      const d = drafts[row.id]
      if (!d) continue
      const original = draftFromRow(row)
      if (
        d.price !== original.price ||
        d.precoDe !== original.precoDe ||
        d.description !== original.description ||
        d.aprendizado !== original.aprendizado
      ) {
        set.add(row.id)
      }
    }
    return set
  }, [rows, drafts])

  if (!open) return null

  const handleSave = async () => {
    if (!rows || changedIds.size === 0) return
    setSaving(true)
    setError(null)

    const built = buildBulkItems(rows, drafts, changedIds)
    if (!built.ok) {
      setError(built.error)
      setSaving(false)
      return
    }
    const items = built.items

    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const base = json?.error ?? "Erro ao salvar"
        setError(json?.detail ? `${base} (${json.detail})` : base)
        return
      }
      // Sucesso parcial: alguns cursos falharam. Mantém o modal aberto e avisa.
      const failed = json?.data?.failed as
        | { id: string; error: string }[]
        | undefined
      if (failed && failed.length > 0) {
        setError(
          `${failed.length} curso(s) não foram salvos: ${failed[0].error}`,
        )
        return
      }
      onSaved()
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-bulk-edit-title"
        className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2
              id="course-bulk-edit-title"
              className="text-base font-semibold text-[var(--color-pmb-green-900)]"
            >
              {title}
            </h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Aplicar o mesmo preço a todos os cursos */}
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-white px-6 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Aplicar o mesmo preço a todos
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border border-gray-200 px-2 focus-within:border-[var(--color-pmb-green)] focus-within:ring-1 focus-within:ring-[var(--color-pmb-lime)]">
                  <span className="text-xs text-gray-400">R$</span>
                  <input
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyPriceToAll()
                      }
                    }}
                    inputMode="decimal"
                    placeholder="0,00"
                    disabled={loading || !rows || rows.length === 0}
                    className="w-28 bg-transparent px-1 py-1.5 font-mono text-sm outline-none"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyPriceToAll}
                  disabled={loading || !rows || rows.length === 0 || !bulkPrice.trim()}
                  className="border-[var(--color-pmb-green)] text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
                >
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  Aplicar a todos
                </Button>
              </div>
            </label>
          </div>
          <p className="text-[11px] text-gray-400 sm:max-w-xs sm:text-right">
            Preenche o preço de todos os cursos abaixo. Você ainda pode ajustar
            cada um antes de salvar.
          </p>
        </div>

        <div className="border-b border-gray-100 bg-[var(--color-pmb-mist)]/40 px-6 py-2.5">
          <p className="flex items-start gap-2 text-[11px] text-[rgba(2,89,24,0.75)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-pmb-green)]" />
            <span>
              {scopeNote ?? (
                <>
                  O <strong className="font-semibold text-[var(--color-pmb-green-900)]">parcelamento sem juros</strong>{" "}
                  não é definido aqui — é um número único configurado em{" "}
                  <strong className="font-semibold text-[var(--color-pmb-green-900)]">
                    Configurações → Pagamento
                  </strong>{" "}
                  e vale para todos os cursos.
                </>
              )}
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando cursos...
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Nenhum curso disponível para edição.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3">Curso</th>
                  <th className="w-32 px-3 py-2">Preço (R$)</th>
                  <th className="w-32 px-3 py-2">
                    De (R$)
                    <span className="block font-normal normal-case tracking-normal text-gray-400">
                      vazio = sem &quot;De&quot;
                    </span>
                  </th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">
                    O que vai aprender
                    <span className="block font-normal normal-case tracking-normal text-gray-400">
                      1 item por linha
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = drafts[row.id]
                  if (!d) return null
                  const changed = changedIds.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 align-top ${
                        changed ? "bg-[var(--color-pmb-lime-50)]/40" : ""
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-medium leading-snug text-[var(--color-pmb-green-900)]">
                          {row.title}
                        </div>
                        {row.paymentType === "MONTHLY" && (
                          <span className="mt-0.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            mensalidade
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={d.price}
                          onChange={(e) =>
                            updateDraft(row.id, { price: e.target.value })
                          }
                          inputMode="decimal"
                          placeholder="0,00"
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={d.precoDe}
                          onChange={(e) =>
                            updateDraft(row.id, { precoDe: e.target.value })
                          }
                          inputMode="decimal"
                          placeholder="—"
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          value={d.description}
                          onChange={(e) =>
                            updateDraft(row.id, { description: e.target.value })
                          }
                          rows={2}
                          maxLength={2000}
                          placeholder={
                            row.defaultDescription
                              ? `Padrão: ${row.defaultDescription.slice(0, 60)}...`
                              : "Descrição padrão do catálogo"
                          }
                          className="w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          value={d.aprendizado}
                          onChange={(e) =>
                            updateDraft(row.id, { aprendizado: e.target.value })
                          }
                          rows={4}
                          placeholder={resolveAprendizado(
                            row.defaultAprendizado,
                          ).join("\n")}
                          className="w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 font-sans text-xs outline-none focus:border-[var(--color-pmb-green)] focus:ring-1 focus:ring-[var(--color-pmb-lime)]"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <div className="text-xs text-gray-500">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : changedIds.size > 0 ? (
              <span>
                {changedIds.size}{" "}
                {changedIds.size === 1
                  ? "curso alterado"
                  : "cursos alterados"}
              </span>
            ) : (
              <span>Nenhuma alteração ainda</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              onClick={handleSave}
              disabled={saving || loading || changedIds.size === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
