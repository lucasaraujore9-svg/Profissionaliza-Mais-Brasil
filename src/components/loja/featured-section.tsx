import Link from "next/link"
import { Flame, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TenantCourseListItem } from "@/lib/tenant/courses"

interface FeaturedSectionProps {
  items: TenantCourseListItem[]
}

const GRADIENTS = [
  "from-green-600 to-emerald-800",
  "from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)]",
  "from-purple-600 to-pink-700",
]

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function FeaturedSection({ items }: FeaturedSectionProps) {
  if (items.length === 0) return null

  return (
    <section className="bg-white py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
            <Flame className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
              Cursos em destaque
            </h2>
            <p className="text-sm text-gray-600">
              Seleção curada com os cursos mais procurados.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {items.slice(0, 3).map((item, index) => (
            <Link
              key={item.id}
              href={`/curso/${item.slug}`}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} p-6 shadow-lg transition-transform hover:-translate-y-1 md:p-8`}
            >
              <div className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                Destaque
              </div>
              <h3 className="mt-4 text-xl font-bold text-white md:text-2xl">
                {item.nome}
              </h3>
              {item.categoria && (
                <p className="mt-2 text-sm text-white/80">{item.categoria}</p>
              )}

              <div className="mt-8 flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/60">A partir de</div>
                  <div className="font-mono text-2xl font-bold text-white">
                    {formatPrice(item.price)}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-white text-[var(--color-pmb-green-900)] hover:bg-gray-50"
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
