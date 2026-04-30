import Image from "next/image"
import {
  GraduationCap,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react"

interface BrandPanelProps {
  tenantName?: string | null
  tenantLogoUrl?: string | null
}

const HIGHLIGHTS = [
  {
    icon: GraduationCap,
    title: "Certificado reconhecido",
    description: "Toda formação inclui certificado digital com validação.",
  },
  {
    icon: Smartphone,
    title: "Estude de qualquer lugar",
    description: "Acesso pelo celular, tablet ou computador, no seu ritmo.",
  },
  {
    icon: ShieldCheck,
    title: "Pagamento seguro",
    description: "Cartão, Pix ou boleto. Sua compra protegida ponta a ponta.",
  },
] as const

export function BrandPanel({ tenantName, tenantLogoUrl }: BrandPanelProps = {}) {
  const isTenant = Boolean(tenantName)
  const displayName = tenantName ?? "Profissionaliza Mais Brasil"

  return (
    <div className="relative hidden overflow-hidden bg-[var(--color-pmb-green)] lg:flex lg:w-1/2">
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_15%,rgba(242,183,5,0.32),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(192,217,4,0.24),transparent_50%)]" />

      <div className="relative z-10 flex w-full flex-col justify-between px-12 py-14 text-white">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pmb-lime)]" />
            {isTenant ? "Sua escola online" : "Plataforma ativa"}
          </div>

          <div className="mt-6 flex items-center justify-start">
            {tenantLogoUrl ? (
              <div className="flex h-28 items-center justify-center rounded-2xl bg-white px-8 py-6 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]">
                <Image
                  src={tenantLogoUrl}
                  alt={displayName}
                  width={400}
                  height={120}
                  className="h-16 w-auto object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white p-6 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]">
                <Image
                  src="/images/logo.png"
                  alt="Profissionaliza Mais Brasil"
                  width={200}
                  height={200}
                  className="h-16 w-auto object-contain"
                />
              </div>
            )}
          </div>

          <h1 className="mt-6 font-display text-3xl leading-tight xl:text-4xl">
            {isTenant ? (
              displayName
            ) : (
              <>Profissionaliza<br />Mais Brasil</>
            )}
          </h1>
          <p className="mt-3 max-w-md text-base text-white/85">
            {isTenant
              ? "Acesse sua área para acompanhar seus cursos, gerenciar sua loja ou continuar sua aprendizagem."
              : "Plataforma completa de cursos profissionalizantes online. Aprenda uma profissão e construa sua carreira."}
          </p>
        </div>

        <ul className="mt-12 space-y-5">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-gold)]/95 text-[var(--color-pmb-green-900)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <p className="mt-0.5 text-sm text-white/80">
                    {item.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-12 flex items-center gap-3 text-xs text-white/80">
          <Sparkles
            className="h-4 w-4 text-[var(--color-pmb-gold)]"
            aria-hidden
          />
          <span>
            {isTenant
              ? "Powered by Profissionaliza Mais Brasil"
              : "Cursos profissionalizantes com certificado reconhecido"}
          </span>
        </div>
      </div>
    </div>
  )
}
