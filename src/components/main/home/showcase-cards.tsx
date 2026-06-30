import { CourseThumb } from "./course-thumb"
import { Award } from "lucide-react"
import type { ShowcaseCard } from "@/lib/catalog/home"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

function CardPreview({ card }: { card: ShowcaseCard }) {
  const { categoria, titulo, preco, imageUrl, selo, accent, paymentType, interestFree } =
    card
  const isMonthly = paymentType === "MONTHLY"
  // Nº de parcelas sem juros da unidade/PMB (não mais fixo em 12x).
  const freeN = displayInterestFreeInstallments(interestFree)
  return (
    <div className="w-[300px] rounded-xl bg-white text-[var(--color-pmb-green)] shadow-[0_20px_40px_-18px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="relative">
        <CourseThumb
          categoria={categoria}
          accent={accent}
          imageUrl={imageUrl}
          titulo={titulo}
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            selo === "novo"
              ? "bg-[var(--color-pmb-cyan)] text-white"
              : "bg-[var(--color-pmb-lime)] text-[var(--color-pmb-green)]"
          }`}
        >
          {selo === "novo" ? "Novo" : "+ Vendido"}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[rgba(2,89,24,0.6)]">
          {categoria}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-tight">{titulo}</h3>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[rgba(2,89,24,0.7)]">
          <Award className="h-3.5 w-3.5 text-[var(--color-pmb-gold)]" />
          <span className="font-medium">Certificado incluso</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[20px] font-bold text-[var(--color-pmb-green)]">
            {preco}
            {isMonthly && (
              <span className="text-[12px] font-bold text-[rgba(2,89,24,0.6)]">
                /mês
              </span>
            )}
          </span>
        </div>
        <p className="text-[11px] text-[rgba(2,89,24,0.65)]">
          {isMonthly
            ? "mensalidade recorrente"
            : freeN
              ? `ou ${freeN}x no cartão sem juros`
              : "à vista ou parcelado no cartão"}
        </p>
      </div>
    </div>
  )
}

export function ShowcaseCards({ cards }: { cards?: ShowcaseCard[] }) {
  // Sem fallback: a vitrine so renderiza com 3 cursos reais do banco. Se
  // o catalogo nao tiver 3 cursos com capa, o bloco e omitido para nao
  // exibir produtos inventados ao publico.
  if (!cards || cards.length < 3) return null
  const list = cards.slice(0, 3)

  return (
    <div className="relative h-[520px] w-full">
      <div aria-hidden className="absolute right-[-40px] top-[40px] rotate-[-6deg]">
        <CardPreview card={list[0]} />
      </div>

      <div
        aria-hidden
        className="absolute left-[-20px] top-[170px] rotate-[4deg] z-10"
      >
        <CardPreview card={list[1]} />
      </div>

      <div
        aria-hidden
        className="absolute right-[10px] bottom-[0px] rotate-[-2deg] z-20"
      >
        <CardPreview card={list[2]} />
      </div>
    </div>
  )
}
