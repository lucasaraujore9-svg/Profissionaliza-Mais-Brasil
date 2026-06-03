"use client"

import { useEffect, useState } from "react"
import { Building2, Save, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { type TecnicaCourseDraft } from "./tecnica-courses-editor"

interface ResellerTecnicaConfigProps {
  tenantId: string
  tecnicaEnabled: boolean
  tecnicaUrl: string | null
  tecnicaLabel: string | null
  /**
   * Mantido por compatibilidade com o chamador. A lista/imagens dos cursos
   * técnicos é padronizada pela PMB e não é mais editada por revendedor.
   */
  tecnicaCourses?: TecnicaCourseDraft[]
  onSaved?: () => void
}

export function ResellerTecnicaConfig({
  tenantId,
  tecnicaEnabled,
  tecnicaUrl,
  tecnicaLabel,
  onSaved,
}: ResellerTecnicaConfigProps) {
  const [enabled, setEnabled] = useState(tecnicaEnabled)
  const [url, setUrl] = useState(tecnicaUrl ?? "")
  const [label, setLabel] = useState(tecnicaLabel ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(tecnicaEnabled)
    setUrl(tecnicaUrl ?? "")
    setLabel(tecnicaLabel ?? "")
  }, [tecnicaEnabled, tecnicaUrl, tecnicaLabel])

  async function save() {
    const trimmedUrl = url.trim()
    if (enabled && !trimmedUrl) {
      toast.error("Informe a URL da escola técnica para ativar")
      return
    }
    if (enabled && trimmedUrl) {
      try {
        new URL(trimmedUrl)
      } catch {
        toast.error("URL inválida (use https://...)")
        return
      }
    }
    setSaving(true)
    try {
      // Não enviamos `courses`: a lista/imagens são padronizadas pela PMB.
      const res = await fetch(`/api/admin/tenants/${tenantId}/tecnica`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          url: trimmedUrl || null,
          label: label.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(enabled ? "Unidade Técnica ativada" : "Unidade Técnica desativada")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Unidade Técnica
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            tecnicaEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {tecnicaEnabled ? "Ativa" : "Desativada"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Quando ativada, exibe categoria, item de menu e seção “Cursos Técnicos”
        na vitrine. O clique abre uma tela de loading e redireciona para a URL
        configurada.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Habilitar Unidade Técnica para este revendedor
          </p>
          <p className="text-xs text-gray-500">
            Mostra na vitrine um link externo para a escola técnica parceira.
          </p>
        </div>
      </label>

      <div className="mt-4 space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          URL da escola técnica
        </label>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://escolatecnica.com.br"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
          />
          {url.trim() && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-gray-200 bg-white p-2 text-gray-500 hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green)]"
              title="Testar link"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
        <p className="text-[11px] text-gray-500">
          Destino do redirect quando alguém clica em “Cursos Técnicos”.
        </p>
      </div>

      <div className="mt-4 space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Rótulo (opcional)
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Cursos Técnicos"
          maxLength={60}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
        <p className="text-[11px] text-gray-500">
          Como o card e o item de menu aparecem na vitrine. Vazio = “Cursos
          Técnicos”.
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/40 p-4 text-xs text-gray-600">
        A lista de cursos técnicos e suas imagens é{" "}
        <b>padronizada pelo Profissionaliza Mais Brasil</b> e exibida igual em
        toda a rede. A unidade controla apenas ativar/desativar, o rótulo e a
        URL de destino acima.
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
