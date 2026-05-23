"use client"

import { useRef, useState } from "react"
import { ImageIcon, Loader2, Save, Trash2, Upload } from "lucide-react"

interface SettingsData {
  certificateAutoIssue: boolean
  certificateMinPercent: number
  certificateRequireCpf: boolean
  groupLogoUrl: string | null
  groupName: string
}

interface Props {
  initial: SettingsData
}

const DEFAULT_GROUP_NAME = "Grupo Bolsa Mais Brasil"

export function AdminCertificateSettingsForm({ initial }: Props) {
  const [data, setData] = useState<SettingsData>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState<SettingsData>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // Estado de upload da logo do grupo (separado do save geral).
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  const dirty =
    data.certificateAutoIssue !== savedSnapshot.certificateAutoIssue ||
    data.certificateMinPercent !== savedSnapshot.certificateMinPercent ||
    data.certificateRequireCpf !== savedSnapshot.certificateRequireCpf ||
    data.groupName.trim() !== savedSnapshot.groupName.trim()

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const payload = {
        certificateAutoIssue: data.certificateAutoIssue,
        certificateMinPercent: data.certificateMinPercent,
        certificateRequireCpf: data.certificateRequireCpf,
        groupName: data.groupName.trim() || DEFAULT_GROUP_NAME,
      }
      const res = await fetch("/api/admin/system-settings/certificates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar")
        return
      }
      const next: SettingsData = {
        ...data,
        groupName: payload.groupName,
      }
      setData(next)
      setSavedSnapshot(next)
      setOk(true)
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true)
    setLogoError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(
        "/api/admin/system-settings/group-logo/upload",
        { method: "POST", body: fd },
      )
      const body = await res.json()
      if (!res.ok) {
        setLogoError(body.error ?? "Falha no upload")
        return
      }
      const newUrl: string | null = body?.data?.url ?? null
      setData((d) => ({ ...d, groupLogoUrl: newUrl }))
      setSavedSnapshot((s) => ({ ...s, groupLogoUrl: newUrl }))
    } catch {
      setLogoError("Erro de rede no upload")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  async function removeLogo() {
    if (!data.groupLogoUrl) return
    setRemoving(true)
    setLogoError(null)
    try {
      const res = await fetch(
        "/api/admin/system-settings/group-logo/upload",
        { method: "DELETE" },
      )
      const body = await res.json()
      if (!res.ok) {
        setLogoError(body.error ?? "Falha ao remover logo")
        return
      }
      setData((d) => ({ ...d, groupLogoUrl: null }))
      setSavedSnapshot((s) => ({ ...s, groupLogoUrl: null }))
    } catch {
      setLogoError("Erro de rede ao remover")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Logo do Grupo Bolsa Mais Brasil
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Imagem usada em <strong>todos</strong> os certificados (PMB e
            unidades). Aparece junto a logo do revendedor.
            Recomendado: PNG transparente, proporção horizontal, até 2MB.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-32 w-56 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
            {data.groupLogoUrl ? (
              // Usamos <img> para nao precisar configurar domain no next.config
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.groupLogoUrl}
                alt="Logo do Grupo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <ImageIcon className="h-6 w-6" />
                <span className="text-[10px] uppercase tracking-wide">
                  Sem logo
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || removing}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-pmb-green-900)] transition-colors hover:bg-[var(--color-pmb-green)] hover:text-white disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {data.groupLogoUrl ? "Trocar logo" : "Enviar nova logo"}
              </button>

              {data.groupLogoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={uploading || removing}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {removing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Remover logo
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (file) uploadLogo(file)
                }}
              />
            </div>

            {logoError && (
              <p className="text-xs font-semibold text-red-700">{logoError}</p>
            )}

            <div>
              <label className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
                Nome do grupo
              </label>
              <input
                type="text"
                value={data.groupName}
                maxLength={160}
                onChange={(e) =>
                  setData((d) => ({ ...d, groupName: e.target.value }))
                }
                placeholder={DEFAULT_GROUP_NAME}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Usado no rodape e na assinatura institucional dos certificados.
              </p>
            </div>
          </div>
        </div>

      </section>

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
