"use client"

import { useEffect, useState } from "react"
import { GraduationCap, Save, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerEjaConfigProps {
  tenantId: string
  ejaEnabled: boolean
  ejaUrl: string | null
  ejaLabel: string | null
  onSaved?: () => void
}

/**
 * Configura o link de EJA de uma unidade. A imagem do banner é padronizada pela
 * PMB; aqui o gestor define apenas o link de destino, o rótulo e o flag. A
 * exibição na home da unidade é controlada pelo toggle da seção "EJA" no painel.
 */
export function ResellerEjaConfig({
  tenantId,
  ejaEnabled,
  ejaUrl,
  ejaLabel,
  onSaved,
}: ResellerEjaConfigProps) {
  const [enabled, setEnabled] = useState(ejaEnabled)
  const [url, setUrl] = useState(ejaUrl ?? "")
  const [label, setLabel] = useState(ejaLabel ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(ejaEnabled)
    setUrl(ejaUrl ?? "")
    setLabel(ejaLabel ?? "")
  }, [ejaEnabled, ejaUrl, ejaLabel])

  async function save() {
    const trimmedUrl = url.trim()
    if (enabled && !trimmedUrl) {
      toast.error("Informe a URL da página de EJA para ativar")
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
      const res = await fetch(`/api/admin/tenants/${tenantId}/eja`, {
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
      toast.success(enabled ? "EJA ativada" : "EJA desativada")
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
          <GraduationCap className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            EJA
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            ejaEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {ejaEnabled ? "Ativa" : "Desativada"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Banner com link para a página personalizada de EJA desta unidade. A
        imagem é padronizada pela PMB; aqui você define o link e o rótulo. A
        seção aparece na home quando ativada em <i>Vitrine → Seções da home</i>.
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
            Habilitar EJA para este revendedor
          </p>
          <p className="text-xs text-gray-500">
            Mostra na vitrine um banner com link para a página de EJA.
          </p>
        </div>
      </label>

      <div className="mt-4 space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          URL da página de EJA
        </label>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
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
          Destino do banner quando alguém clica em “EJA”.
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
          placeholder="EJA — Ensino para Jovens e Adultos"
          maxLength={60}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
        />
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
