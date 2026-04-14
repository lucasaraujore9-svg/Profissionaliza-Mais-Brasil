import Link from "next/link"
import { ArrowRight, Clock, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

const cursos = [
  {
    slug: "excel-avancado",
    nome: "Excel Avançado",
    categoria: "Tecnologia",
    aulas: 40,
    horas: "120h",
    preco: "R$ 197",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    slug: "marketing-digital",
    nome: "Marketing Digital",
    categoria: "Marketing",
    aulas: 35,
    horas: "100h",
    preco: "R$ 297",
    gradient: "from-purple-500 to-pink-600",
  },
  {
    slug: "programacao-web",
    nome: "Programação Web",
    categoria: "Tecnologia",
    aulas: 60,
    horas: "200h",
    preco: "R$ 497",
    gradient: "from-green-500 to-emerald-700",
  },
]

export function CatalogoPreview() {
  return (
    <section id="cursos" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] md:text-4xl">
              Catálogo de cursos
            </h2>
            <p className="mt-3 max-w-xl text-gray-600">
              Mais de 120 cursos prontos pra você revender, organizados por categoria.
            </p>
          </div>
          <Link href="/seja-revendedor" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Ver todos
            <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((curso) => (
            <div
              key={curso.slug}
              className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className={`relative h-48 bg-gradient-to-br ${curso.gradient}`}>
                <div className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#1A1A2E] backdrop-blur">
                  {curso.categoria}
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-[#1A1A2E]">{curso.nome}</h3>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    {curso.aulas} aulas
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {curso.horas}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                  <span className="font-mono text-xl font-bold text-[#1A1A2E]">
                    {curso.preco}
                  </span>
                  <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                    Ver curso
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
