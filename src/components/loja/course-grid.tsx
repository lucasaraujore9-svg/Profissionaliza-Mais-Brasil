import { CourseCard, type CourseCardData } from "./course-card"

const cursos: CourseCardData[] = [
  {
    slug: "excel-avancado",
    nome: "Excel Avançado — Do Zero ao PROCV",
    categoria: "Tecnologia",
    preco: "R$ 197",
    precoOriginal: "R$ 297",
    rating: 4.9,
    ratingCount: 1240,
    horas: "120h",
    gradient: "from-green-500 to-emerald-700",
  },
  {
    slug: "marketing-digital",
    nome: "Marketing Digital Completo 2026",
    categoria: "Marketing",
    preco: "R$ 297",
    rating: 4.8,
    ratingCount: 890,
    horas: "100h",
    gradient: "from-purple-500 to-pink-600",
  },
  {
    slug: "programacao-web",
    nome: "Programação Web Full Stack",
    categoria: "Tecnologia",
    preco: "R$ 497",
    precoOriginal: "R$ 797",
    rating: 4.9,
    ratingCount: 2104,
    horas: "200h",
    gradient: "from-blue-500 to-indigo-700",
  },
  {
    slug: "gestao-negocios",
    nome: "Gestão de Pequenos Negócios",
    categoria: "Administração",
    preco: "R$ 247",
    rating: 4.7,
    ratingCount: 512,
    horas: "80h",
    gradient: "from-orange-500 to-red-600",
  },
  {
    slug: "design-grafico",
    nome: "Design Gráfico no Canva e Photoshop",
    categoria: "Marketing",
    preco: "R$ 197",
    rating: 4.8,
    ratingCount: 720,
    horas: "90h",
    gradient: "from-pink-400 to-rose-600",
  },
  {
    slug: "cuidador-idosos",
    nome: "Cuidador de Idosos — Formação Completa",
    categoria: "Saúde",
    preco: "R$ 147",
    precoOriginal: "R$ 247",
    rating: 4.9,
    ratingCount: 430,
    horas: "60h",
    gradient: "from-teal-500 to-cyan-700",
  },
]

export function CourseGrid() {
  return (
    <section className="bg-[#FAFAFA] py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
              Catálogo completo
            </h2>
            <p className="text-sm text-gray-600">
              {cursos.length} cursos disponíveis
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Ordenar por: <span className="font-medium text-[#1A1A2E]">Populares</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((curso) => (
            <CourseCard key={curso.slug} curso={curso} />
          ))}
        </div>
      </div>
    </section>
  )
}
