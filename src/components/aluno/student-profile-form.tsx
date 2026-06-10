"use client"

import { useState } from "react"

interface ProfileData {
  nome: string
  email: string
  fone: string
  cpf: string
  cidade: string
  estado: string
  cep: string
  rua: string
  numero: string
  bairro: string
}

export function StudentProfileForm({ initial }: { initial: ProfileData }) {
  const [data, setData] = useState<ProfileData>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function set<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setData((d) => ({ ...d, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch("/api/aluno/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar")
        return
      }
      setOk(true)
    } catch {
      setError("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
        Dados pessoais
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        O CPF é usado para vincular pagamentos e matrículas — não é editável
        aqui. Se trocar o email, use o novo email (ou o CPF) no próximo login.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" value={data.nome} onChange={(v) => set("nome", v)} />
        <Field label="Email" value={data.email} onChange={(v) => set("email", v)} />
        <Field label="CPF" value={data.cpf} readOnly />
        <Field label="Telefone" value={data.fone} onChange={(v) => set("fone", v)} />

        <Field label="CEP" value={data.cep} onChange={(v) => set("cep", v)} />
        <Field label="Cidade" value={data.cidade} onChange={(v) => set("cidade", v)} />
        <Field label="Estado" value={data.estado} onChange={(v) => set("estado", v)} />
        <Field label="Rua" value={data.rua} onChange={(v) => set("rua", v)} />
        <Field label="Número" value={data.numero} onChange={(v) => set("numero", v)} />
        <Field label="Bairro" value={data.bairro} onChange={(v) => set("bairro", v)} />
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Dados atualizados com sucesso.
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar dados"}
        </button>
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={`mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${readOnly ? "bg-gray-50 text-gray-500" : "bg-white"}`}
      />
    </label>
  )
}
