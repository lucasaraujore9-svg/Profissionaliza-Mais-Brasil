"use client"

import { useState } from "react"
import { Loader2, Save } from "lucide-react"

interface SettingsData {
  certificateAutoIssue: boolean
  certificateMinPercent: number
  certificateRequireCpf: boolean
}

interface Props {
  initial: SettingsData
}

export function AdminCertificateSettingsForm({ initial }: Props) {
  const [data, setData] = useState<SettingsData>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const dirty =
    data.certificateAutoIssue !== initial.certificateAutoIssue ||
    data.certificateMinPercent !== initial.certificateMinPercent ||
    data.certificateRequireCpf !== initial.certificateRequireCpf

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch("/api/admin/system-settings/certificates", {
        method: "PUT",
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
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ToggleRow
          label="Auto-emitir certificados ao concluir curso"
          description="Quando o cron sincroniza progresso e detecta conclusão, gera o certificado automaticamente."
          checked={data.certificateAutoIssue}
          onChange={(v) =>
            setData((d) => ({ ...d, certificateAutoIssue: v }))
          }
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Porcentagem mínima para emissão
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Progresso mínimo do aluno na plataforma parceira para que o certificado
          seja emitido. Valores entre 50% e 100%.
        </p>

        <div className="mt-5 flex items-center gap-4">
          <input
            type="range"
            min={50}
            max={100}
            step={1}
            value={data.certificateMinPercent}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                certificateMinPercent: Number(e.target.value),
              }))
            }
            className="flex-1 accent-[var(--color-pmb-green)]"
          />
          <div className="w-20 text-center">
            <div className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
              {data.certificateMinPercent}%
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ToggleRow
          label="Exigir CPF cadastrado para emitir"
          description="Quando ativado, certificados de alunos sem CPF não serão gerados (nem manualmente)."
          checked={data.certificateRequireCpf}
          onChange={(v) =>
            setData((d) => ({ ...d, certificateRequireCpf: v }))
          }
        />
      </section>

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
        <div>
          {ok && (
            <span className="text-xs font-semibold text-emerald-700">
              Configurações salvas.
            </span>
          )}
          {error && (
            <span className="text-xs font-semibold text-red-700">{error}</span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar
        </button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {label}
        </div>
        {description && (
          <p className="mt-1 text-xs text-gray-600">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[var(--color-pmb-green)]" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  )
}
