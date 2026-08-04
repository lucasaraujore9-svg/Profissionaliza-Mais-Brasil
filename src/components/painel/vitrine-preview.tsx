import Image from "next/image"
import type { VitrineConfig } from "./vitrine-config-form"

interface VitrinePreviewProps {
  config: VitrineConfig
  previewHost: string
}

export function VitrinePreview({ config, previewHost }: VitrinePreviewProps) {
  const heroBackground = `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`
  // Mesma precedência do <head> da vitrine (lib/seo/tenant-metadata): favicon
  // própria e, na falta dela, a logo.
  const tabIcon = config.faviconUrl ?? config.logoUrl

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

      <div className="p-4">
        <div
          className="flex items-center justify-between rounded-lg px-4 py-3 text-xs font-semibold text-white"
          style={{ backgroundColor: config.primaryColor }}
        >
          <span className="flex items-center gap-2">
            {config.logoUrl ? (
              <span className="relative block h-5 w-5 overflow-hidden rounded bg-white/20">
                <Image
                  src={config.logoUrl}
                  alt={config.name}
                  fill
                  className="object-contain p-0.5"
                  unoptimized
                />
              </span>
            ) : null}
            {config.name || "Sua loja"}
          </span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px]">
            Entrar
          </span>
        </div>

        <div
          className="mt-3 rounded-xl p-6 text-white"
          style={{
            background: heroBackground,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            {config.tagline ?? "Bem-vindo"}
          </div>
          <div className="mt-1 text-lg font-bold leading-tight">
            {config.description ?? "Personalize sua loja no painel."}
          </div>
          <button
            type="button"
            className="mt-3 rounded-full px-3 py-1 text-[11px] font-semibold text-white"
            style={{ backgroundColor: config.secondaryColor }}
          >
            Ver cursos
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-gray-100"
            >
              <div
                className="h-12"
                style={{
                  background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`,
                }}
              />
              <div className="p-2">
                <div className="h-1.5 w-3/4 rounded-full bg-gray-200" />
                <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-gray-100" />
                <div
                  className="mt-2 font-mono text-[10px] font-bold"
                  style={{ color: config.primaryColor }}
                >
                  R$ 267
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 text-center text-[10px] text-gray-500">
          © {new Date().getFullYear()} {config.name || "Sua loja"}
        </div>
      </div>
    </div>
  )
}
