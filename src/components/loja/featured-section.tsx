import Link from "next/link"
import { Flame, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const featured = [
  {
    slug: "excel-avancado",
    nome: "Excel Avançado",
    tagline: "Mais vendido do mês",
    preco: "R$ 197",
    gradient: "from-green-600 to-emerald-800",
    badge: "Bestseller",
  },
  {
    slug: "programacao-web",
    nome: "Programação Web Full Stack",
    tagline: "Turma nova com 40% OFF",
    preco: "R$ 497",
    gradient: "from-blue-600 to-indigo-800",
    badge: "Lançamento",
  },
  {
    slug: "marketing-digital",
    nome: "Marketing Digital 2026",
    tagline: "Atualizado pra IA + Social",
    preco: "R$ 297",
    gradient: "from-purple-600 to-pink-700",
    badge: "Atualizado",
  },
]

export function FeaturedSection() {
  return (
    <section className="bg-white py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
            <Flame className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
              Cursos em destaque
            </h2>
            <p className="text-sm text-gray-600">
              Seleção curada com os cursos mais procurados.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {featured.map((item) => (
            <Link
              key={item.slug}
              href={`/loja/curso/${item.slug}`}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} p-6 shadow-lg transition-transform hover:-translate-y-1 md:p-8`}
            >
              <div className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                {item.badge}
              </div>
              <h3 className="mt-4 text-xl font-bold text-white md:text-2xl">
                {item.nome}
              </h3>
              <p className="mt-2 text-sm text-white/80">{item.tagline}</p>

              <div className="mt-8 flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/60">A partir de</div>
                  <div className="font-mono text-2xl font-bold text-white">
                    {item.preco}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-white text-[#1A1A2E] hover:bg-gray-50"
                >
                  Ver curso
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
