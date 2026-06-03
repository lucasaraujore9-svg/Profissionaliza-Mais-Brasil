"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Eye, Loader2, Save, Trash2, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  CertificateHtmlPreview,
  type CertificateLayout,
  type CertificateTemplateData,
} from "@/components/shared/certificate-html-preview"

export type { CertificateLayout, CertificateTemplateData }

const DEFAULT_TEMPLATE: CertificateTemplateData = {
  layout: "CLASSIC",
  backgroundUrl: null,
  logoUrl: null,
  sealUrl: null,
  signatureUrl: null,
  primaryColor: "#16653f",
  secondaryColor: "#0f3d24",
  titleText: "CERTIFICADO DE CONCLUSÃO",
  bodyText:
    "Certificamos que {nome} concluiu com aproveitamento o curso de {curso}, com carga horária de {carga_horaria}, em {data_conclusao}.",
  footerText: null,
  signerName: null,
  signerTitle: null,
  showQrCode: true,
  showValidationUrl: true,
  showSeal: false,
  isActive: true,
}

type AssetKind = "background" | "logo" | "seal" | "signature"

const PLACEHOLDERS = [
  { token: "{nome}", label: "Nome do aluno" },
  { token: "{curso}", label: "Nome do curso" },
  { token: "{carga_horaria}", label: "Carga horária" },
  { token: "{data_conclusao}", label: "Data de conclusão" },
  { token: "{codigo}", label: "Código de validação" },
  { token: "{unidade}", label: "Unidade emissora" },
  { token: "{cpf}", label: "CPF do aluno" },
] as const

interface Props {
  initial: CertificateTemplateData | null
  saveEndpoint: string
  uploadEndpoint: string
  /**
   * Endpoint que renderiza o PDF real a partir do template enviado no corpo
   * (POST). Usado pelo botão "Ver PDF real" para mostrar o resultado exato das
   * edições atuais (mesmo sem salvar).
   */
  previewEndpoint: string
  scopeLabel: string
  /**
   * Logo do Grupo Bolsa Mais Brasil (selo "powered by") configurada em
   * SystemSettings pelo admin. Aparece no rodape do preview de todos os
   * layouts. Null = mostra apenas o texto do `groupName`.
   */
  groupLogoUrl?: string | null
  /**
   * Nome do grupo exibido junto ao selo. Default "Grupo Bolsa Mais Brasil".
   */
  groupName?: string
}

export function CertificateTemplateEditor({
  initial,
  saveEndpoint,
  uploadEndpoint,
  previewEndpoint,
  scopeLabel,
  groupLogoUrl = null,
  groupName = "Grupo Bolsa Mais Brasil",
}: Props) {
  const [data, setData] = useState<CertificateTemplateData>(
    initial ?? DEFAULT_TEMPLATE,
  )
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<AssetKind | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // Revoga o object URL anterior ao trocar/desmontar para não vazar memória.
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    }
  }, [pdfPreviewUrl])

  async function handleViewRealPdf() {
    setPdfLoading(true)
    setError(null)
    try {
      const res = await fetch(previewEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? "Falha ao gerar a prévia em PDF")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch {
      setError("Erro de rede ao gerar a prévia em PDF")
    } finally {
      setPdfLoading(false)
    }
  }

  useEffect(() => {
    if (savedMsg) {
      const t = setTimeout(() => setSavedMsg(null), 2500)
      return () => clearTimeout(t)
    }
  }, [savedMsg])

  function update<K extends keyof CertificateTemplateData>(
    key: K,
    value: CertificateTemplateData[K],
  ) {
    setData((d) => ({ ...d, [key]: value }))
  }

  function insertPlaceholder(token: string) {
    const el = bodyRef.current
    if (!el) {
      update("bodyText", `${data.bodyText} ${token}`)
      return
    }
    const start = el.selectionStart ?? data.bodyText.length
    const end = el.selectionEnd ?? data.bodyText.length
    const next = data.bodyText.slice(0, start) + token + data.bodyText.slice(end)
    update("bodyText", next)
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    }, 0)
  }

  async function handleUpload(kind: AssetKind, file: File) {
    setUploading(kind)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("kind", kind)
      fd.append("file", file)
      const res = await fetch(uploadEndpoint, { method: "POST", body: fd })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha no upload")
        return
      }
      const url = body.data?.url as string
      const fieldMap: Record<AssetKind, keyof CertificateTemplateData> = {
        background: "backgroundUrl",
        logo: "logoUrl",
        seal: "sealUrl",
        signature: "signatureUrl",
      }
      update(fieldMap[kind], url)
    } catch {
      setError("Erro de rede ao enviar arquivo")
    } finally {
      setUploading(null)
    }
  }

  async function handleRemoveAsset(kind: AssetKind) {
    if (!confirm("Remover esta imagem?")) return
    setUploading(kind)
    setError(null)
    try {
      const res = await fetch(`${uploadEndpoint}?kind=${kind}`, {
        method: "DELETE",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Falha ao remover")
        return
      }
      const fieldMap: Record<AssetKind, keyof CertificateTemplateData> = {
        background: "backgroundUrl",
        logo: "logoUrl",
        seal: "sealUrl",
        signature: "signatureUrl",
      }
      update(fieldMap[kind], null)
    } catch {
      setError("Erro de rede ao remover")
    } finally {
      setUploading(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const res = await fetch(saveEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao salvar")
        return
      }
      setSavedMsg("Template salvo com sucesso.")
    } catch {
      setError("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Layout
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Escolha o estilo base do certificado.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["CLASSIC", "MODERN", "MINIMAL"] as const).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => update("layout", layout)}
                className={`rounded-xl border-2 p-3 text-left text-sm font-semibold transition-all ${
                  data.layout === layout
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 text-[var(--color-pmb-green-900)]"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {layout === "CLASSIC" && "Clássico"}
                {layout === "MODERN" && "Moderno"}
                {layout === "MINIMAL" && "Minimalista"}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Imagens
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Envie em PNG/JPG/WEBP até 5MB.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AssetUploader
              label="Fundo"
              hint="Imagem que ocupa o certificado inteiro"
              previewUrl={data.backgroundUrl}
              uploading={uploading === "background"}
              onPick={(f) => handleUpload("background", f)}
              onRemove={() => handleRemoveAsset("background")}
            />
            <AssetUploader
              label="Logo"
              hint="Logo da sua escola (topo)"
              previewUrl={data.logoUrl}
              uploading={uploading === "logo"}
              onPick={(f) => handleUpload("logo", f)}
              onRemove={() => handleRemoveAsset("logo")}
            />
            <AssetUploader
              label="Selo / brasão"
              hint="Selo opcional (canto)"
              previewUrl={data.sealUrl}
              uploading={uploading === "seal"}
              onPick={(f) => handleUpload("seal", f)}
              onRemove={() => handleRemoveAsset("seal")}
            />
            <AssetUploader
              label="Assinatura"
              hint="PNG com fundo transparente"
              previewUrl={data.signatureUrl}
              uploading={uploading === "signature"}
              onPick={(f) => handleUpload("signature", f)}
              onRemove={() => handleRemoveAsset("signature")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Cores
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ColorField
              id="primary"
              label="Primária"
              value={data.primaryColor ?? "#16653f"}
              onChange={(v) => update("primaryColor", v)}
            />
            <ColorField
              id="secondary"
              label="Secundária"
              value={data.secondaryColor ?? "#0f3d24"}
              onChange={(v) => update("secondaryColor", v)}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Textos
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Use os placeholders abaixo para inserir dados dinâmicos.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="title-text">Título</Label>
              <Input
                id="title-text"
                value={data.titleText}
                onChange={(e) => update("titleText", e.target.value)}
                className="mt-1.5"
                maxLength={160}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="body-text">Corpo do texto</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.token}
                      type="button"
                      onClick={() => insertPlaceholder(p.token)}
                      title={p.label}
                      className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-gray-700 transition-colors hover:border-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
                    >
                      {p.token}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                id="body-text"
                ref={bodyRef}
                rows={5}
                value={data.bodyText}
                onChange={(e) => update("bodyText", e.target.value)}
                className="mt-1.5 font-mono text-xs"
                maxLength={2000}
              />
            </div>

            <div>
              <Label htmlFor="footer-text">Rodapé (opcional)</Label>
              <Textarea
                id="footer-text"
                rows={2}
                value={data.footerText ?? ""}
                onChange={(e) =>
                  update("footerText", e.target.value || null)
                }
                className="mt-1.5"
                maxLength={500}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Assinatura
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="signer-name">Nome do signatário</Label>
              <Input
                id="signer-name"
                value={data.signerName ?? ""}
                onChange={(e) =>
                  update("signerName", e.target.value || null)
                }
                placeholder="Ex: João da Silva"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="signer-title">Cargo</Label>
              <Input
                id="signer-title"
                value={data.signerTitle ?? ""}
                onChange={(e) =>
                  update("signerTitle", e.target.value || null)
                }
                placeholder="Ex: Diretor pedagógico"
                className="mt-1.5"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Opções
          </h3>
          <div className="mt-4 space-y-3">
            <ToggleRow
              label="Mostrar QR Code de validação"
              checked={data.showQrCode}
              onChange={(v) => update("showQrCode", v)}
            />
            <ToggleRow
              label="Mostrar URL pública de validação"
              checked={data.showValidationUrl}
              onChange={(v) => update("showValidationUrl", v)}
            />
            <ToggleRow
              label="Exibir selo/brasão"
              checked={data.showSeal}
              onChange={(v) => update("showSeal", v)}
            />
            <ToggleRow
              label="Template ativo"
              checked={data.isActive}
              onChange={(v) => update("isActive", v)}
            />
          </div>
        </section>

        <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
          <div>
            {savedMsg && (
              <span className="text-xs font-semibold text-emerald-700">
                {savedMsg}
              </span>
            )}
            {error && (
              <span className="text-xs font-semibold text-red-700">
                {error}
              </span>
            )}
            {!savedMsg && !error && (
              <span className="text-xs text-gray-500">{scopeLabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Salvando..." : "Salvar template"}
          </button>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Pré-visualização
          </h3>
          <button
            type="button"
            onClick={handleViewRealPdf}
            disabled={pdfLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-lime-50)] disabled:opacity-50"
          >
            {pdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {pdfLoading ? "Gerando..." : "Ver PDF real"}
          </button>
        </div>
        <CertificateHtmlPreview
          data={data}
          groupLogoUrl={groupLogoUrl}
          groupName={groupName}
        />
        <p className="text-[11px] text-gray-500">
          Prévia aproximada (HTML). Dados mostrados são de exemplo. Clique em{" "}
          <strong>Ver PDF real</strong> para o resultado exato gerado com suas
          edições atuais (mesmo sem salvar).
        </p>

        {pdfPreviewUrl && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
                PDF real
              </h4>
              <a
                href={pdfPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Abrir em nova aba
              </a>
            </div>
            <iframe
              src={pdfPreviewUrl}
              title="Prévia em PDF do certificado"
              className="aspect-[1.41/1] w-full rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface AssetUploaderProps {
  label: string
  hint: string
  previewUrl: string | null
  uploading: boolean
  onPick: (file: File) => void
  onRemove: () => void
}

function AssetUploader({
  label,
  hint,
  previewUrl,
  uploading,
  onPick,
  onRemove,
}: AssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
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
              <Upload className="h-5 w-5" />
              <span className="text-center">{hint}</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              if (file) onPick(file)
              if (e.target) e.target.value = ""
            }}
          />
        </label>
        {previewUrl && !uploading && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
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

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
      <span className="text-sm text-gray-700">{label}</span>
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
    </label>
  )
}
