"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"

type Layout = "CLASSIC" | "MODERN" | "MINIMAL"

interface LayoutOption {
  id: Layout
  title: string
  description: string
  preview: React.ReactNode
}

const OPTIONS: LayoutOption[] = [
  {
    id: "CLASSIC",
    title: "Clássico",
    description:
      "Layout tradicional com bordas decorativas, ideal para um visual elegante e formal.",
    preview: <ClassicPreview />,
  },
  {
    id: "MODERN",
    title: "Moderno",
    description:
      "Layout limpo com faixa lateral colorida, perfeito para uma identidade contemporânea.",
    preview: <ModernPreview />,
  },
  {
    id: "MINIMAL",
    title: "Minimalista",
    description:
      "Layout simples e direto, focado no conteúdo e na clareza da informação.",
    preview: <MinimalPreview />,
  },
]

interface Props {
  initialLayout: Layout
  tenantLogoUrl: string | null
  tenantName: string
}

export function CertificateLayoutSelector({
  initialLayout,
  tenantLogoUrl,
  tenantName,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Layout>(initialLayout)
  const [savedLayout, setSavedLayout] = useState<Layout>(initialLayout)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const dirty = selected !== savedLayout

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
          escolhe apenas o estilo visual entre as opções abaixo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {OPTIONS.map((option) => {
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
              <div className="border-b border-gray-100 bg-gray-50 p-4">
                {option.preview}
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
            {OPTIONS.find((o) => o.id === savedLayout)?.title ?? savedLayout}
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

function ClassicPreview() {
  return (
    <div className="relative mx-auto aspect-[1.4/1] w-full max-w-[220px] rounded-md bg-white p-3 shadow-inner ring-1 ring-gray-200">
      <div className="h-full w-full rounded border-2 border-double border-[var(--color-pmb-green)] p-2">
        <div className="flex h-full flex-col items-center justify-between">
          <div className="h-3 w-12 rounded-sm bg-gray-300" />
          <div className="flex flex-col items-center gap-1">
            <div className="h-1.5 w-24 rounded-sm bg-[var(--color-pmb-green-900)]" />
            <div className="h-1 w-16 rounded-sm bg-gray-300" />
            <div className="h-1 w-20 rounded-sm bg-gray-200" />
          </div>
          <div className="flex w-full items-end justify-between">
            <div className="h-2 w-10 rounded-sm bg-gray-200" />
            <div className="h-4 w-4 rounded-full bg-yellow-400/70" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ModernPreview() {
  return (
    <div className="relative mx-auto flex aspect-[1.4/1] w-full max-w-[220px] overflow-hidden rounded-md bg-white shadow-inner ring-1 ring-gray-200">
      <div className="w-1/4 bg-[var(--color-pmb-green)]" />
      <div className="flex flex-1 flex-col justify-between p-3">
        <div className="h-3 w-12 rounded-sm bg-gray-300" />
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-24 rounded-sm bg-[var(--color-pmb-green-900)]" />
          <div className="h-1 w-20 rounded-sm bg-gray-300" />
          <div className="h-1 w-16 rounded-sm bg-gray-200" />
        </div>
        <div className="h-2 w-12 rounded-sm bg-gray-200" />
      </div>
    </div>
  )
}

function MinimalPreview() {
  return (
    <div className="relative mx-auto aspect-[1.4/1] w-full max-w-[220px] rounded-md bg-white p-4 shadow-inner ring-1 ring-gray-200">
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="h-2 w-10 rounded-sm bg-gray-300" />
        <div className="h-px w-16 bg-[var(--color-pmb-green)]" />
        <div className="h-1.5 w-24 rounded-sm bg-[var(--color-pmb-green-900)]" />
        <div className="h-1 w-20 rounded-sm bg-gray-200" />
        <div className="h-px w-16 bg-[var(--color-pmb-green)]" />
        <div className="h-2 w-10 rounded-sm bg-gray-300" />
      </div>
    </div>
  )
}
