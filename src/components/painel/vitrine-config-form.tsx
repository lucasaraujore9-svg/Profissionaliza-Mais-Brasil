"use client"

import { useRef, useState } from "react"
import { Upload, Image as ImageIcon, Loader2, Trash2 } from "lucide-react"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface VitrineConfig {
  name: string
  tagline: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string
  secondaryColor: string
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
}

export type VitrineAssetKind = "logo" | "banner"

interface VitrineConfigFormProps {
  config: VitrineConfig
  onChange: (config: VitrineConfig) => void
  onUpload: (kind: VitrineAssetKind, file: File) => Promise<void>
  onRemove: (kind: VitrineAssetKind) => Promise<void>
  uploading: VitrineAssetKind | null
}

export function VitrineConfigForm({
  config,
  onChange,
  onUpload,
  onRemove,
  uploading,
}: VitrineConfigFormProps) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const bannerInputRef = useRef<HTMLInputElement | null>(null)

  const update = <K extends keyof VitrineConfig>(
    key: K,
    value: VitrineConfig[K],
  ) => {
    onChange({ ...config, [key]: value })
  }

  async function handleFile(kind: VitrineAssetKind, file: File | null) {
    if (!file) return
    setUploadError(null)
    try {
      await onUpload(kind, file)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro no upload")
    }
  }

  async function handleRemove(kind: VitrineAssetKind) {
    setUploadError(null)
    const label = kind === "logo" ? "logo" : "banner"
    if (!confirm(`Remover o ${label}?`)) return
    try {
      await onRemove(kind)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao remover")
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Identidade visual</h3>
        <p className="mt-1 text-xs text-gray-600">
          Envie os elementos gráficos da sua marca.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <AssetUploader
            label="Logo"
            hint="PNG, SVG ou WEBP (max 5MB)"
            icon="logo"
            previewUrl={config.logoUrl}
            uploading={uploading === "logo"}
            inputRef={logoInputRef}
            onChoose={(file) => handleFile("logo", file)}
            onRemove={() => handleRemove("logo")}
          />
          <AssetUploader
            label="Banner hero"
            hint="Recomendado 1920x600 (max 5MB)"
            icon="banner"
            previewUrl={config.bannerUrl}
            uploading={uploading === "banner"}
            inputRef={bannerInputRef}
            onChoose={(file) => handleFile("banner", file)}
            onRemove={() => handleRemove("banner")}
          />
        </div>

        {uploadError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {uploadError}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Paleta de cores</h3>
        <p className="mt-1 text-xs text-gray-600">
          As cores serão aplicadas no tempo real do preview ao lado.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primary-color"
            label="Primária"
            value={config.primaryColor}
            onChange={(v) => update("primaryColor", v)}
          />
          <ColorField
            id="secondary-color"
            label="Secundária"
            value={config.secondaryColor}
            onChange={(v) => update("secondaryColor", v)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Textos</h3>
        <p className="mt-1 text-xs text-gray-600">
          O que aparece na vitrine do seu aluno.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="v-nome">Nome da loja</Label>
            <Input
              id="v-nome"
              value={config.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-tagline">Frase curta (tagline)</Label>
            <Input
              id="v-tagline"
              value={config.tagline ?? ""}
              onChange={(e) => update("tagline", e.target.value || null)}
              placeholder="Ex: Cursos que aceleram sua carreira"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-desc">Descrição</Label>
            <Textarea
              id="v-desc"
              rows={3}
              value={config.description ?? ""}
              onChange={(e) => update("description", e.target.value || null)}
              className="mt-1.5"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Contato e redes</h3>
        <p className="mt-1 text-xs text-gray-600">
          Aparece no rodapé da vitrine.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="v-wa">WhatsApp</Label>
            <Input
              id="v-wa"
              value={config.whatsapp ?? ""}
              onChange={(e) => update("whatsapp", e.target.value || null)}
              placeholder="(11) 99999-9999"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-ig">Instagram</Label>
            <Input
              id="v-ig"
              value={config.instagram ?? ""}
              onChange={(e) => update("instagram", e.target.value || null)}
              placeholder="@sualoja"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-fb">Facebook</Label>
            <Input
              id="v-fb"
              value={config.facebook ?? ""}
              onChange={(e) => update("facebook", e.target.value || null)}
              placeholder="sualoja"
              className="mt-1.5"
            />
          </div>
        </div>
      </section>
    </div>
  )
}

interface AssetUploaderProps {
  label: string
  hint: string
  icon: "logo" | "banner"
  previewUrl: string | null
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onChoose: (file: File | null) => void
  onRemove: () => void
}

function AssetUploader({
  label,
  hint,
  icon,
  previewUrl,
  uploading,
  inputRef,
  onChoose,
  onRemove,
}: AssetUploaderProps) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-1.5">
        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 text-xs text-gray-500 transition-colors hover:border-[var(--color-pmb-cyan)] hover:bg-[var(--color-pmb-lime-50)]/50">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processando...</span>
            </>
          ) : previewUrl ? (
            <div className="relative flex h-full w-full items-center justify-center bg-white">
              <Image
                src={previewUrl}
                alt={label}
                fill
                className="object-contain p-2"
                unoptimized
              />
            </div>
          ) : (
            <>
              {icon === "logo" ? (
                <Upload className="h-5 w-5" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
              <span>{hint}</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              onChoose(file)
              if (e.target) e.target.value = ""
            }}
          />
        </label>
        {previewUrl && !uploading && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${label.toLowerCase()}`}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {previewUrl && !uploading && (
        <p className="mt-1 text-[11px] text-gray-500">
          Clique na imagem para trocar, ou no <Trash2 className="inline h-3 w-3 align-middle" /> para remover.
        </p>
      )}
    </div>
  )
}

interface ColorFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
        />
        <span className="font-mono text-xs font-semibold text-[var(--color-pmb-green-900)]">
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
