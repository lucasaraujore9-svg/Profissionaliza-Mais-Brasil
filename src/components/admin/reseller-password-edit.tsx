"use client"

import { useState } from "react"
import { KeyRound, Save, Sparkles, Eye, EyeOff, Copy, Check, AlertTriangle } from "lucide-react"

interface Props {
  tenantId: string
  ownerEmail?: string | null
}

export function ResellerPasswordEdit({ tenantId, ownerEmail }: Props) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(generate: boolean) {
    setError(null)
    setResult(null)
    setCopied(false)

    if (!generate) {
      if (password.length < 8) {
        setError("A senha precisa ter pelo menos 8 caracteres.")
        return
      }
      if (password !== confirm) {
        setError("A confirmação não confere.")
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generate ? { generate: true } : { newPassword: password }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Falha ao alterar a senha")
        return
      }
      setResult(json.data.password as string)
      setPassword("")
      setConfirm("")
    } catch {
      setError("Erro de rede ao alterar a senha")
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard pode estar indisponível — usuário copia manualmente
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-pmb-green-900)]">
        <KeyRound className="h-4 w-4" />
        Senha de acesso do revendedor
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Defina uma nova senha ou gere uma automaticamente. A senha atual{" "}
        <strong>não pode ser exibida</strong> — fica guardada criptografada (hash) e
        é irreversível.
      </p>
      {ownerEmail && (
        <p className="mt-1 text-[11px] text-gray-500">
          Login do dono: <span className="font-mono">{ownerEmail}</span>
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Nova senha</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-500 transition-colors hover:bg-gray-50"
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">Confirmar nova senha</span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a senha"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-start gap-2 text-xs text-emerald-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Senha alterada. Copie agora e repasse ao revendedor — ela não será exibida de novo.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-emerald-300 bg-white px-3 py-2 font-mono text-sm text-emerald-900">
              {result}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green-700)] transition-colors hover:bg-[var(--color-pmb-green)]/5 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          Gerar automática
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar senha"}
        </button>
      </div>
    </div>
  )
}
