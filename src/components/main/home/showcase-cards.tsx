import { CourseThumb } from "./course-thumb"
import { Star } from "lucide-react"
import type { ShowcaseCard } from "@/lib/catalog/home"

function CardPreview({ card }: { card: ShowcaseCard }) {
  const { categoria, titulo, preco, imageUrl, selo, accent, rating } = card
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
        <div className="mt-2 flex items-center gap-1.5 text-[12px]">
          <Star className="h-3.5 w-3.5 fill-[var(--color-pmb-gold)] text-[var(--color-pmb-gold)]" />
          <span className="font-bold">{rating}</span>
          <span className="text-[rgba(2,89,24,0.6)]">(2.340 alunos)</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[20px] font-bold text-[var(--color-pmb-green)]">
            {preco}
          </span>
        </div>
        <p className="text-[11px] text-[rgba(2,89,24,0.65)]">
          ou 12x no cartão sem juros
        </p>
      </div>
    </div>
  )
}

const FALLBACK: ShowcaseCard[] = [
  {
    slug: "manicure-pedicure",
    categoria: "Beleza",
    titulo: "Manicure e Pedicure Profissional",
    preco: "R$ 47,00",
    imageUrl: null,
    selo: "mais-vendido",
    accent: "gold",
    rating: "4.9",
  },
  {
    slug: "eletricista",
    categoria: "Elétrica",
    titulo: "Eletricista Predial e Industrial",
    preco: "R$ 97,00",
    imageUrl: null,
    selo: "mais-vendido",
    accent: "cyan",
    rating: "4.8",
  },
  {
    slug: "confeitaria",
    categoria: "Gastronomia",
    titulo: "Confeitaria do Zero ao Profissional",
    preco: "R$ 89,00",
    imageUrl: null,
    selo: "novo",
    accent: "lime",
    rating: "4.9",
  },
]

export function ShowcaseCards({ cards }: { cards?: ShowcaseCard[] }) {
  const list = cards && cards.length === 3 ? cards : FALLBACK

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

      <div
        aria-hidden
        className="absolute right-[40px] top-[-14px] rotate-[6deg] rounded-md bg-[var(--color-pmb-gold)] px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--color-pmb-green)] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)]"
      >
        Até 70% OFF no Pix
      </div>
    </div>
  )
}
