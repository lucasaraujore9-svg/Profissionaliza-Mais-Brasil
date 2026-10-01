import Image from "next/image"
import type { VitrineConfig } from "./vitrine-config-form"
import { logoForTone, resolveTheme, type Tone } from "@/lib/tenant/theme"

interface VitrinePreviewProps {
  config: VitrineConfig
  previewHost: string
}

/**
 * Prévia ao vivo da identidade. Usa `resolveTheme`, a mesma conta da loja: o
 * que aparece aqui é o que a página vai pintar, inclusive o texto escolhido
 * pelo contraste.
 */
export function VitrinePreview({ config, previewHost }: VitrinePreviewProps) {
  const t = resolveTheme(config)
  // Mesma precedência do <head> da vitrine (lib/seo/tenant-metadata): favicon
  // própria e, na falta dela, a logo.
  const tabIcon = config.faviconUrl ?? config.logoUrl
  const name = config.name || "Sua loja"

  const surface = (tone: Tone) =>
    tone === "dark"
      ? { backgroundColor: t.dark, color: t.darkOn }
      : { backgroundColor: "#ffffff", color: t.ink }

  const logo = (tone: Tone) => {
    const { url, plate } = logoForTone(tone, config)
    if (!url) return <span className="truncate text-xs font-bold">{name}</span>
    return (
      <span
        className={`relative block h-6 w-16 shrink-0 ${plate ? "rounded bg-white" : ""}`}
      >
        <Image src={url} alt={name} fill className="object-contain p-0.5" unoptimized />
      </span>
    )
  }

  return (
    <div className="sticky top-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <span className="flex flex-1 items-center justify-center gap-1.5 truncate rounded bg-white px-2 py-0.5 font-mono text-[10px] text-gray-500">
          {tabIcon && (
            <span className="relative h-3 w-3 shrink-0">
              <Image
                src={tabIcon}
                alt=""
                fill
                className="rounded-[2px] object-contain"
                unoptimized
              />
            </span>
          )}
          <span className="truncate">{previewHost}</span>
        </span>
      </div>

      {/* Topo */}
      <div
        className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 text-[11px] font-semibold"
        style={surface(t.headerTone)}
      >
        {logo(t.headerTone)}
        <span className="flex items-center gap-2">
          <span>Entrar</span>
          <span
            className="rounded-md px-2 py-1 text-[10px] font-bold"
            style={{ backgroundColor: t.cta, color: t.ctaOn }}
          >
            Quero estudar
          </span>
        </span>
      </div>

      {/* Área escura */}
      <div className="px-4 py-5" style={{ backgroundColor: t.dark, color: t.darkOn }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
          {config.tagline ?? "Bem-vindo"}
        </div>
        <div className="mt-1 text-base font-bold leading-tight">
          {config.description ?? "Personalize sua loja no painel."}
        </div>
        <span
          className="mt-3 inline-block rounded-md px-3 py-1.5 text-[11px] font-bold"
          style={{ backgroundColor: t.cta, color: t.ctaOn }}
        >
          Comprar
        </span>
      </div>

      {/* Área clara */}
      <div className="p-4">
        <div className="text-xs font-bold" style={{ color: t.ink }}>
          Cursos em destaque
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-gray-100">
              <div className="h-10" style={{ backgroundColor: t.dark, opacity: 0.85 }} />
              <div className="p-2">
                <div className="h-1.5 w-3/4 rounded-full bg-gray-200" />
                <div
                  className="mt-2 font-mono text-[10px] font-bold"
                  style={{ color: t.ink }}
                >
                  R$ 267
                </div>
                <span
                  className="mt-2 block rounded px-2 py-1 text-center text-[10px] font-semibold"
                  style={{ backgroundColor: t.btn, color: t.btnOn }}
                >
                  Continuar
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé */}
      <div
        className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 text-[10px]"
        style={
          t.footerTone === "dark"
            ? surface("dark")
            : { backgroundColor: "#F4F4EE", color: t.ink }
        }
      >
        {logo(t.footerTone)}
        <span className="opacity-70">
          © {new Date().getFullYear()} {name}
        </span>
      </div>

      {/* Área do aluno */}
      <div className="border-t border-gray-200 bg-gray-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Área do aluno
        </div>
        <div className="mt-2 flex overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div
            className="w-24 space-y-1 p-2 text-[9px] font-medium"
            style={{
              ...surface(t.studentMenuTone),
              borderRight: t.studentMenuTone === "light" ? "1px solid #e5e7eb" : undefined,
            }}
          >
            <div
              className="rounded px-1.5 py-1 font-semibold"
              style={{ backgroundColor: t.cta, color: t.ctaOn }}
            >
              Meus cursos
            </div>
            <div className="px-1.5 py-1 opacity-85">Pagamentos</div>
            <div className="px-1.5 py-1 opacity-85">Certificados</div>
          </div>
          <div className="flex-1 p-2">
            <div className="text-[10px] font-bold" style={{ color: t.ink }}>
              Meus cursos
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 w-1/2 rounded-full"
                style={{ backgroundColor: t.btn }}
              />
            </div>
            <span
              className="mt-2 inline-block rounded px-2 py-1 text-[9px] font-semibold"
              style={{ backgroundColor: t.btn, color: t.btnOn }}
            >
              Acessar curso
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
