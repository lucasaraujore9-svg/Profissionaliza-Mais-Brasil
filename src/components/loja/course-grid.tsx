import { CourseCard, type CourseCardData } from "./course-card"
import type { TenantCourseListItem } from "@/lib/tenant/courses"

interface CourseGridProps {
  items: TenantCourseListItem[]
  total: number
}

const GRADIENTS = [
  "from-green-500 to-emerald-700",
  "from-purple-500 to-pink-600",
  "from-blue-500 to-indigo-700",
  "from-orange-500 to-red-600",
  "from-pink-400 to-rose-600",
  "from-teal-500 to-cyan-700",
]

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function toCardData(
  item: TenantCourseListItem,
  index: number,
): CourseCardData {
  return {
    slug: item.slug,
    nome: item.nome,
    categoria: item.categoria ?? "Geral",
    preco: formatPrice(item.price),
    precoOriginal:
      item.originalPrice && item.originalPrice > item.price
        ? formatPrice(item.originalPrice)
        : undefined,
    rating: 4.8,
    horas: item.horas ?? "—",
    gradient: GRADIENTS[index % GRADIENTS.length]!,
  }
}

export function CourseGrid({ items, total }: CourseGridProps) {
  return (
    <section className="bg-[#FAFAFA] py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
              Catálogo completo
            </h2>
            <p className="text-sm text-gray-600">
              {total} {total === 1 ? "curso disponível" : "cursos disponíveis"}
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Ordenar por:{" "}
            <span className="font-medium text-[#1A1A2E]">Populares</span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-sm text-gray-600">
              Nenhum curso encontrado com os filtros atuais.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <CourseCard key={item.id} curso={toCardData(item, index)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
