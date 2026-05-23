"use client"

import { useEffect, useState } from "react"
import { Loader2, KeyRound } from "lucide-react"
import { toast } from "sonner"

const PIX_TYPES = [
  { value: "CPF", label: "CPF" },
  { value: "CNPJ", label: "CNPJ" },
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Celular" },
  { value: "EVP", label: "Chave aleatória" },
] as const

type PixType = (typeof PIX_TYPES)[number]["value"]

interface PixState {
  pixKey: string | null
  pixKeyType: PixType | null
}

export function PixForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<PixState>({ pixKey: "", pixKeyType: null })
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/painel/config/pix")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar")
        return json.data as PixState
      })
      .then((data) => {
        if (cancelled) return
        setState({ pixKey: data.pixKey ?? "", pixKeyType: data.pixKeyType })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Erro ao carregar PIX")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)

    if (saving) return
    const key = (state.pixKey ?? "").trim()
    if (key && !state.pixKeyType) {
      setFieldError("Selecione o tipo da chave PIX")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/painel/config/pix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixKey: key || null,
          pixKeyType: key ? state.pixKeyType : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFieldError(json?.error || "Não foi possível salvar")
        toast.error(json?.error || "Não foi possível salvar")
        return
      }
      toast.success(key ? "Chave PIX salva" : "Chave PIX removida")
    } catch {
      toast.error("Erro de conexão ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function onClear() {
    if (saving) return
    setState({ pixKey: "", pixKeyType: null })
    setFieldError(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando PIX…
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6"
    >
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--color-pmb-lime-50)] p-2 text-[var(--color-pmb-green)]">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--color-pmb-green)]">
            Chave PIX para receber comissões
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Usada para pagar as suas comissões do programa de indicações. Pode
            ser alterada a qualquer momento.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Tipo
          </span>
          <select
            value={state.pixKeyType ?? ""}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                pixKeyType: (e.target.value || null) as PixType | null,
              }))
            }
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--color-pmb-green)]"
          >
            <option value="">Selecione…</option>
            {PIX_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Chave
          </span>
          <input
            value={state.pixKey ?? ""}
            onChange={(e) =>
              setState((s) => ({ ...s, pixKey: e.target.value }))
            }
            placeholder="Digite a chave correspondente ao tipo escolhido"
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--color-pmb-green)]"
          />
          {fieldError && (
            <p className="mt-1 text-xs text-red-600">{fieldError}</p>
          )}
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={saving || (!state.pixKey && !state.pixKeyType)}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50"
        >
          Limpar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar chave PIX"}
        </button>
      </div>
    </form>
  )
}
