"use client"

import { useState } from "react"
import { Save, Trash2, KeyRound } from "lucide-react"

interface PmbMpTokenConfigProps {
  configured: boolean
  tokenSource: "db" | "env" | null
  canEdit: boolean
}

export function PmbMpTokenConfig({
  configured,
  tokenSource,
  canEdit,
}: PmbMpTokenConfigProps) {
  const [token, setToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function save() {
    if (!token.trim()) {
      setError("Cole o token antes de salvar")
      return
    }
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmbMpAccessToken: token.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar token")
        return
      }
      setOk("Token salvo com sucesso. Recarregue a página para refletir o status.")
      setToken("")
    } catch {
      setError("Erro de rede ao salvar token")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm("Remover o token do Mercado Pago? Vendas diretas via MP ficarão indisponíveis.")) return
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmbMpAccessToken: null }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao remover token")
        return
      }
      setOk("Token removido. Recarregue a página.")
    } catch {
      setError("Erro de rede ao remover token")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#009EE3] text-white">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Token Mercado Pago — conta principal PMB
          </h4>
          <p className="mt-1 text-xs text-gray-600">
            Access token usado nas vendas diretas pela vitrine principal e pelo painel
            administrativo. Armazenado criptografado (AES-256-GCM) e nunca exposto em
            tela depois de salvo.
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            configured
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {configured ? "Configurado" : "Não configurado"}
        </span>
      </div>

      {tokenSource === "env" && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          Hoje o token vem da variável de ambiente <code>PMB_MP_ACCESS_TOKEN</code>.
          Salvar abaixo passa a usar a versão do banco (recomendado).
        </p>
      )}

      {canEdit ? (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="pmb-mp-token" className="text-xs font-semibold text-gray-700">
              Cole o novo access token
            </label>
            <input
              id="pmb-mp-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="APP_USR-..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-[var(--color-pmb-green)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Pegue em mercadopago.com.br/developers → Suas integrações → Credenciais
              de produção → Access Token.
            </p>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          {ok && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{ok}</p>
          )}

          <div className="flex justify-end gap-2">
            {configured && tokenSource === "db" && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !token.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Salvando..." : "Salvar token"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-gray-500">
          Apenas o SUPER_ADMIN pode alterar este token.
        </p>
      )}
    </div>
  )
}
