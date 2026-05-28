"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save } from "lucide-react"
import type { ManagementScope, StudentData } from "./types"
import { apiBase } from "./types"

interface FormState {
  nome: string
  email: string
  fone: string
  fone2: string
  cpf: string
  cidade: string
  estado: string
  cep: string
  rua: string
  numero: string
  bairro: string
  nascimento: string
}

function toInputDate(iso: string | null): string {
  if (!iso) return ""
  return iso.slice(0, 10)
}

export function EditTab({
  student,
  scope,
}: {
  student: StudentData
  scope: ManagementScope
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    nome: student.nome,
    email: student.email ?? "",
    fone: student.fone ?? "",
    fone2: student.fone2 ?? "",
    cpf: student.cpf ?? "",
    cidade: student.cidade ?? "",
    estado: student.estado ?? "",
    cep: student.cep ?? "",
    rua: student.rua ?? "",
    numero: student.numero ?? "",
    bairro: student.bairro ?? "",
    nascimento: toInputDate(student.nascimento),
  })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  function bind<K extends keyof FormState>(key: K) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((p) => ({ ...p, [key]: e.target.value })),
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch(apiBase(scope, student.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ ok: false, text: body.error ?? "Falha ao salvar" })
      } else {
        setResult({ ok: true, text: "Dados atualizados." })
        router.refresh()
      }
    } catch {
      setResult({ ok: false, text: "Erro de rede" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-gray-200 bg-white p-5"
    >
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome completo" required>
          <input
            type="text"
            required
            maxLength={120}
            {...bind("nome")}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            maxLength={160}
            {...bind("email")}
            className={inputClass}
          />
        </Field>
        <Field label="CPF">
          <input
            type="text"
            maxLength={20}
            {...bind("cpf")}
            className={inputClass}
          />
        </Field>
        <Field label="Nascimento">
          <input
            type="date"
            {...bind("nascimento")}
            className={inputClass}
          />
        </Field>
        <Field label="Telefone">
          <input
            type="text"
            maxLength={40}
            {...bind("fone")}
            className={inputClass}
          />
        </Field>
        <Field label="Telefone 2">
          <input
            type="text"
            maxLength={40}
            {...bind("fone2")}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Endereço
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="CEP">
            <input
              type="text"
              maxLength={20}
              {...bind("cep")}
              className={inputClass}
            />
          </Field>
          <Field label="Cidade">
            <input
              type="text"
              maxLength={80}
              {...bind("cidade")}
              className={inputClass}
            />
          </Field>
          <Field label="UF">
            <input
              type="text"
              maxLength={40}
              {...bind("estado")}
              className={inputClass}
            />
          </Field>
          <Field label="Rua">
            <input
              type="text"
              maxLength={200}
              {...bind("rua")}
              className={inputClass}
            />
          </Field>
          <Field label="Número">
            <input
              type="text"
              maxLength={20}
              {...bind("numero")}
              className={inputClass}
            />
          </Field>
          <Field label="Bairro">
            <input
              type="text"
              maxLength={80}
              {...bind("bairro")}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {result && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            result.ok
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
        >
          {result.text}
        </div>
      )}

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  )
}

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
