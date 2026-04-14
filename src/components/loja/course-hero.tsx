import { Star, Clock, Users, Award } from "lucide-react"

interface CourseHeroProps {
  categoria: string
  nome: string
  tagline: string
  rating: number
  ratingCount: number
  alunos: string
  horas: string
  gradient: string
}

export function CourseHero({
  categoria,
  nome,
  tagline,
  rating,
  ratingCount,
  alunos,
  horas,
  gradient,
}: CourseHeroProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div>
        <div className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {categoria}
        </div>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#1A1A2E] md:text-4xl lg:text-5xl">
          {nome}
        </h1>

        <p className="mt-4 text-base text-gray-600 md:text-lg">{tagline}</p>

        <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold text-[#1A1A2E]">{rating.toFixed(1)}</span>
            <span className="text-gray-500">({ratingCount.toLocaleString("pt-BR")} avaliações)</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <Users className="h-4 w-4" />
            <span>{alunos} alunos</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <Clock className="h-4 w-4" />
            <span>{horas} de conteúdo</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <Award className="h-4 w-4" />
            <span>Com certificado</span>
          </div>
        </div>
      </div>

      <div
        className={`relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} shadow-xl`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white/90 p-5 backdrop-blur">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-10 w-10 text-blue-600"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
