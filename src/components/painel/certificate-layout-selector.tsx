"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Eye, Loader2 } from "lucide-react"
import {
  CertificateHtmlPreview,
  buildSampleData,
  type CertificateLayout,
  type CertificateTemplateData,
} from "@/components/shared/certificate-html-preview"

const LAYOUT_META: {
  id: CertificateLayout
  title: string
  description: string
}[] = [
  {
    id: "CLASSIC",
    title: "Clássico",
    description:
      "Layout tradicional com bordas decorativas, ideal para um visual elegante e formal.",
  },
  {
    id: "MODERN",
    title: "Moderno",
    description:
      "Layout limpo com faixa lateral colorida, perfeito para uma identidade contemporânea.",
  },
  {
    id: "MINIMAL",
    title: "Minimalista",
    description:
      "Layout simples e direto, focado no conteúdo e na clareza da informação.",
  },
]

interface Props {
  initialLayout: CertificateLayout
  tenantLogoUrl: string | null
  tenantName: string
  /** Template resolvido (design herdado do PMB + logo da escola). */
  template: CertificateTemplateData
  groupLogoUrl: string | null
  groupName: string
}

export function CertificateLayoutSelector({
  initialLayout,
  tenantLogoUrl,
  tenantName,
  template,
  groupLogoUrl,
  groupName,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<CertificateLayout>(initialLayout)
  const [savedLayout, setSavedLayout] = useState<CertificateLayout>(initialLayout)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Layout cujo PDF real está sendo exibido (null = nenhum). Mostrar o PDF é
  // explícito (botão) para não renderizar PDF a cada troca de modelo.
  const [pdfLayout, setPdfLayout] = useState<CertificateLayout | null>(null)

  const dirty = selected !== savedLayout

  const sample = useMemo(() => buildSampleData(tenantName), [tenantName])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch("/api/painel/certificate-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: selected }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          typeof json?.error === "string"
            ? json.error
            : "Erro ao salvar o layout. Tente novamente.",
        )
        return
      }
      setSavedLayout(selected)
      setSuccess(true)
      router.refresh()
    } catch {
      setError("Erro de rede ao salvar. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {tenantLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenantLogoUrl}
                alt={`Logo ${tenantName}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="px-2 text-center text-xs font-semibold text-gray-400">
                Sem logo
              </span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Logo da sua escola
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              A logo do certificado é puxada automaticamente da sua escola{" "}
              <strong>{tenantName}</strong>. Para trocá-la, vá em{" "}
              <a
                href="/painel/vitrine"
                className="font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Configurações da vitrine
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Escolha um layout
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          O texto, as cores e o conteúdo do certificado são padronizados. Você
          escolhe apenas o estilo visual entre as opções abaixo. As prévias
          mostram dados de exemplo com a identidade da sua escola.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {LAYOUT_META.map((option) => {
          const isActive = selected === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all ${
                isActive
                  ? "border-[var(--color-pmb-green)] ring-2 ring-[var(--color-pmb-green)]/30"
                  : "border-gray-200 hover:border-[var(--color-pmb-green)]/60 hover:shadow-md"
              }`}
            >
              {isActive && (
                <div className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-pmb-green)] text-white shadow">
                  <Check className="h-4 w-4" />
                </div>
              )}
              <div className="border-b border-gray-100 bg-gray-50 p-3">
                <CertificateHtmlPreview
                  data={{ ...template, layout: option.id }}
                  groupLogoUrl={groupLogoUrl}
                  groupName={groupName}
                  sample={sample}
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {option.title}
                </h3>
                <p className="mt-1 text-xs text-gray-600">
                  {option.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Prévia grande do modelo selecionado */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Prévia —{" "}
              {LAYOUT_META.find((o) => o.id === selected)?.title ?? selected}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Prévia aproximada com dados de exemplo. Veja o PDF real para o
              resultado exato.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPdfLayout(selected)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-lime-50)]"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver PDF real
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CertificateHtmlPreview
            data={{ ...template, layout: selected }}
            groupLogoUrl={groupLogoUrl}
            groupName={groupName}
            sample={sample}
          />

          {pdfLayout && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
                  PDF real
                </h4>
                <a
                  href={`/api/painel/certificate-template/preview?layout=${pdfLayout}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
                >
                  Abrir em nova aba
                </a>
              </div>
              <iframe
                key={pdfLayout}
                src={`/api/painel/certificate-template/preview?layout=${pdfLayout}`}
                title="Prévia em PDF do certificado"
                className="aspect-[1.41/1] w-full rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && !dirty && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Layout salvo com sucesso. Novos certificados emitidos usarão este
          modelo.
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-600">
          Layout atual:{" "}
          <strong className="text-[var(--color-pmb-green-900)]">
            {LAYOUT_META.find((o) => o.id === savedLayout)?.title ?? savedLayout}
          </strong>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar layout"
          )}
        </button>
      </div>
    </div>
  )
}
