"use client"

import { useCallback, useEffect, useState } from "react"
import { Save, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  VitrineConfigForm,
  type VitrineConfig,
  type VitrineAssetKind,
} from "./vitrine-config-form"
import { VitrinePreview } from "./vitrine-preview"
import { clientLogger } from "@/lib/logger-client"

const defaultConfig: VitrineConfig = {
  name: "",
  tagline: null,
  description: null,
  logoUrl: null,
  primaryColor: "#2563eb",
  secondaryColor: "#1e40af",
  whatsapp: null,
  instagram: null,
  facebook: null,
}

export function VitrineEditor() {
  const [config, setConfig] = useState<VitrineConfig>(defaultConfig)
  const [initial, setInitial] = useState<VitrineConfig>(defaultConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<VitrineAssetKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [previewHost, setPreviewHost] = useState<string>("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetch("/api/painel/vitrine")
      .then(async (res) => {
        const body = await res.json()
        if (!active) return
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar vitrine")
          return
        }
        setConfig(body.data)
        setInitial(body.data)
      })
      .catch((err) => {
        clientLogger.warn(
          { err: String(err), event: "vitrine_editor.load_failed" },
          "carregar vitrine falhou",
        )
        if (active) setError("Erro de rede ao carregar vitrine")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    fetch("/api/painel/dominio")
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json()
        const info = body.data
        if (info?.customDomain) {
          setPreviewHost(info.customDomain)
        } else if (info?.subdomainFull) {
          setPreviewHost(info.subdomainFull)
        }
      })
      .catch((err) => {
        clientLogger.warn(
          { err: String(err), event: "vitrine_editor.dominio_fetch_failed" },
          "fetch de domínio para preview falhou",
        )
      })
  }, [])

  const handleUpload = useCallback(
    async (kind: VitrineAssetKind, file: File) => {
      setUploading(kind)
      try {
        const form = new FormData()
        form.set("kind", kind)
        form.set("file", file)
        const res = await fetch("/api/painel/vitrine/upload", {
          method: "POST",
          body: form,
        })
        const body = await res.json()
        if (!res.ok) {
          throw new Error(body.error ?? "Falha ao enviar arquivo")
        }
        const url = body.data.url as string
        setConfig((prev) => ({ ...prev, logoUrl: url }))
        setInitial((prev) => ({ ...prev, logoUrl: url }))
      } finally {
        setUploading(null)
      }
    },
    [],
  )

  const handleRemove = useCallback(async (kind: VitrineAssetKind) => {
    setUploading(kind)
    try {
      const res = await fetch(`/api/painel/vitrine/upload?kind=${kind}`, {
        method: "DELETE",
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao remover arquivo")
      }
      setConfig((prev) => ({ ...prev, logoUrl: null }))
      setInitial((prev) => ({ ...prev, logoUrl: null }))
    } finally {
      setUploading(null)
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/painel/vitrine", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          tagline: config.tagline,
          description: config.description,
          primaryColor: config.primaryColor,
          secondaryColor: config.secondaryColor,
          whatsapp: config.whatsapp,
          instagram: config.instagram,
          facebook: config.facebook,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        const fields = body.fields as Record<string, string[]> | undefined
        const fieldError = fields ? Object.values(fields)[0]?.[0] : undefined
        throw new Error(fieldError ?? body.error ?? "Falha ao salvar")
      }
      setConfig(body.data)
      setInitial(body.data)
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const dirty = JSON.stringify(config) !== JSON.stringify(initial)

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando configuração...
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <VitrineConfigForm
          config={config}
          onChange={setConfig}
          onUpload={handleUpload}
          onRemove={handleRemove}
          uploading={uploading}
        />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {savedAt && !dirty && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Salvo
            </span>
          )}
          <Button
            size="lg"
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? "Salvando..." : "Salvar mudanças"}
          </Button>
        </div>
      </div>

      <div className="hidden lg:block">
        <VitrinePreview config={config} previewHost={previewHost} />
      </div>
    </div>
  )
}
