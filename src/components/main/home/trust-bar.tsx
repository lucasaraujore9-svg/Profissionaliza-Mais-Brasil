import { ShieldCheck, Smartphone, MessageCircle, Award, Banknote } from "lucide-react"

const SELOS = [
  {
    icon: Award,
    title: "Certificado incluso",
    subtitle: "Reconhecido em todo Brasil",
    color: "var(--color-pmb-lime)",
  },
  {
    icon: Banknote,
    title: "Pix, cartão ou boleto",
    subtitle: "Até 12x sem juros",
    color: "var(--color-pmb-cyan)",
  },
  {
    icon: Smartphone,
    title: "Estude pelo celular",
    subtitle: "Acesso por 12 meses",
    color: "var(--color-pmb-gold)",
  },
  {
    icon: ShieldCheck,
    title: "7 dias de garantia",
    subtitle: "Não gostou, devolvemos",
    color: "var(--color-pmb-green)",
  },
  {
    icon: MessageCircle,
    title: "Suporte no WhatsApp",
    subtitle: "Segunda a sábado",
    color: "#25D366",
  },
] as const

export function TrustBar() {
  return (
    <section
      aria-label="Benefícios"
      className="border-b border-[rgba(2,89,24,0.08)] bg-white"
    >
      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5 py-6 md:grid-cols-3 md:py-7 lg:grid-cols-5 lg:gap-x-6">
          {SELOS.map((selo) => (
            <li key={selo.title} className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${selo.color} 14%, white)`,
                }}
              >
                <selo.icon
                  className="h-5 w-5"
                  style={{ color: selo.color }}
                  strokeWidth={2.25}
                  aria-hidden
                />
              </span>
              <div className="leading-tight">
                <p className="text-[13px] font-bold text-[var(--color-pmb-green)]">
                  {selo.title}
                </p>
                <p className="text-[12px] text-[rgba(2,89,24,0.6)]">
                  {selo.subtitle}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
