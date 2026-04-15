import Link from "next/link"
import {
  Scissors,
  Heart,
  ChefHat,
  Zap,
  Hammer,
  PawPrint,
  Briefcase,
  Car,
  Shirt,
  Monitor,
  Wrench,
  TrendingUp,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface Categoria {
  nome: string
  slug: string
  icon: LucideIcon
  cursos: string
  cor: string
}

const CATEGORIAS: Categoria[] = [
  { nome: "Beleza e Estética", slug: "beleza", icon: Scissors, cursos: "340 cursos", cor: "var(--color-pmb-gold)" },
  { nome: "Saúde e Bem-estar", slug: "saude", icon: Heart, cursos: "210 cursos", cor: "var(--color-pmb-cyan)" },
  { nome: "Gastronomia", slug: "gastronomia", icon: ChefHat, cursos: "180 cursos", cor: "var(--color-pmb-lime)" },
  { nome: "Eletricista e Hidráulica", slug: "eletrica", icon: Zap, cursos: "120 cursos", cor: "var(--color-pmb-gold)" },
  { nome: "Construção Civil", slug: "construcao", icon: Hammer, cursos: "95 cursos", cor: "var(--color-pmb-terracotta)" },
  { nome: "Pet e Veterinária", slug: "pet", icon: PawPrint, cursos: "70 cursos", cor: "var(--color-pmb-green)" },
  { nome: "Administração", slug: "administracao", icon: Briefcase, cursos: "150 cursos", cor: "var(--color-pmb-cyan)" },
  { nome: "Automotivo", slug: "automotivo", icon: Car, cursos: "60 cursos", cor: "var(--color-pmb-terracotta)" },
  { nome: "Moda e Costura", slug: "moda", icon: Shirt, cursos: "85 cursos", cor: "var(--color-pmb-gold)" },
  { nome: "Tecnologia", slug: "tecnologia", icon: Monitor, cursos: "220 cursos", cor: "var(--color-pmb-cyan)" },
  { nome: "Manutenção", slug: "manutencao", icon: Wrench, cursos: "75 cursos", cor: "var(--color-pmb-green)" },
  { nome: "Vendas e Negócios", slug: "vendas", icon: TrendingUp, cursos: "110 cursos", cor: "var(--color-pmb-lime)" },
]

export function CategoriesGrid() {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="mb-7 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
            Escolha sua área
          </p>
          <h2 className="mt-1 text-[24px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[30px]">
            Qual profissão você quer aprender?
          </h2>
          <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.65)]">
            Mais de 2.400 cursos em 12 áreas que dão dinheiro no Brasil
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {CATEGORIAS.map((cat) => (
            <li key={cat.slug}>
              <Link
                href={`/categoria/${cat.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[rgba(2,89,24,0.22)] hover:shadow-[0_10px_24px_-12px_rgba(2,89,24,0.2)]"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${cat.cor} 16%, white)` }}
                >
                  <cat.icon
                    className="h-5 w-5"
                    strokeWidth={2.25}
                    style={{ color: cat.cor }}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-[var(--color-pmb-green)] group-hover:underline">
                    {cat.nome}
                  </p>
                  <p className="text-[12px] text-[rgba(2,89,24,0.6)]">{cat.cursos}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
