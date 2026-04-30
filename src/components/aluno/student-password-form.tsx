"use client"

import { useState } from "react"
import { KeyRound } from "lucide-react"

export function StudentPasswordForm({
  passwordSetAt,
}: {
  passwordSetAt: string | null
}) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const isFirstTime = !passwordSetAt

  async function save() {
    setError(null)
    setOk(false)
    if (next.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres")
      return
    }
    if (next !== confirm) {
      setError("A confirmação da senha não confere")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/aluno/senha", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current || null,
          newPassword: next,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao alterar senha")
        return
      }
      setOk(true)
      setCurrent("")
      setNext("")
      setConfirm("")
    } catch {
      setError("Erro de rede ao alterar senha")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {isFirstTime ? "Definir senha de acesso" : "Alterar senha"}
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">
            {isFirstTime
              ? "Sua senha ainda não foi configurada — defina agora para acessar este painel sem precisar do link enviado por email."
              : `Última alteração: ${new Date(passwordSetAt!).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {!isFirstTime && (
          <Field
            label="Senha atual"
            type="password"
            value={current}
            onChange={setCurrent}
          />
        )}
        <Field
          label="Nova senha"
          type="password"
          value={next}
          onChange={setNext}
          hint="Mínimo 8 caracteres"
        />
        <Field
          label="Confirmar senha"
          type="password"
          value={confirm}
          onChange={setConfirm}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Senha atualizada com sucesso.
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          {saving ? "Salvando..." : isFirstTime ? "Definir senha" : "Alterar senha"}
        </button>
      </div>
    </section>
  )
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  hint,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
      />
      {hint && <span className="mt-1 block text-[10px] text-gray-500">{hint}</span>}
    </label>
  )
}
