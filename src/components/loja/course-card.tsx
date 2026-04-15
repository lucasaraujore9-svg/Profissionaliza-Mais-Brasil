import Link from "next/link"
import { Star, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface CourseCardData {
  slug: string
  nome: string
  categoria: string
  preco: string
  precoOriginal?: string
  rating: number
  horas: string
  gradient: string
  ratingCount?: number
}

interface CourseCardProps {
  curso: CourseCardData
}

export function CourseCard({ curso }: CourseCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-1 hover:border-[rgba(2,89,24,0.18)] hover:shadow-lg">
      <div className={`relative h-44 bg-gradient-to-br ${curso.gradient}`}>
        <div className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-[var(--color-pmb-green-900)] backdrop-blur">
          {curso.categoria}
        </div>
        {curso.precoOriginal && (
          <div className="absolute top-3 right-3 rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-bold text-[var(--color-pmb-green-900)]">
            OFF
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold leading-tight text-[var(--color-pmb-green-900)] line-clamp-2">
          {curso.nome}
        </h3>

        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="font-medium text-[var(--color-pmb-green-900)]">{curso.rating.toFixed(1)}</span>
            {curso.ratingCount && <span>({curso.ratingCount})</span>}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {curso.horas}
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            {curso.precoOriginal && (
              <div className="font-mono text-xs text-gray-400 line-through">
                {curso.precoOriginal}
              </div>
            )}
            <div className="font-mono text-xl font-bold text-[var(--color-pmb-green-900)]">
              {curso.preco}
            </div>
          </div>
          <Link href={`/loja/curso/${curso.slug}`}>
            <Button size="sm" className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]">
              Ver mais
            </Button>
          </Link>
        </div>
      </div>
    </article>
  )
}
