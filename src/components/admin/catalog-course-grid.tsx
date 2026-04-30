import Image from "next/image"
import { BookOpen, Users, Pencil, Sparkles } from "lucide-react"

export interface CatalogCourse {
  id: string
  nome: string
  slug: string
  qtdAulas: number
  cargaHoraria: string | null
  precoOriginal: number | null
  precoPromocional: number | null
  categoriaLoja: string | null
  destaque: boolean
  status: string
  capaImageUrl: string | null
  syncedAt: string
  resellers: number
  students: number
  precoVitrineMain?: number | null
  destaqueHome?: boolean
  hasOverride?: boolean
}

interface CatalogCourseGridProps {
  courses: CatalogCourse[]
  canEdit?: boolean
  onEdit?: (id: string) => void
}

function formatMoney(v: number | null): string {
  if (v === null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function CatalogCourseGrid({ courses, canEdit = false, onEdit }: CatalogCourseGridProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {courses.length} cursos no catálogo
        </h3>
        <span className="text-xs text-gray-500">Agregado de todos os revendedores</span>
      </div>

      {courses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-sm text-gray-500">
          Nenhum curso no catálogo. Execute uma sincronização para puxar os cursos.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses.map((c) => {
            const preco = c.precoPromocional ?? c.precoOriginal
            return (
              <article
                key={c.id}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60 transition-all hover:border-[rgba(2,89,24,0.25)] hover:shadow-sm"
              >
                {c.capaImageUrl ? (
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    <Image
                      src={c.capaImageUrl}
                      alt={c.nome}
                      fill
                      sizes="(max-width:768px) 100vw, 25vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}
                <div className="p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <h4 className="mt-3 text-sm font-semibold leading-snug text-[var(--color-pmb-green-900)]">
                    {c.nome}
                  </h4>
                  {c.cargaHoraria && (
                    <p className="mt-1 text-[11px] text-gray-500">{c.cargaHoraria}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {c.students.toLocaleString("pt-BR")} alunos
                    </span>
                    <span className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                      {formatMoney(preco)}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-medium text-gray-500">
                    {c.resellers} revendedor{c.resellers === 1 ? "" : "es"} vendendo
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {c.destaqueHome ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                        <Sparkles className="h-3 w-3" /> Curadoria admin
                      </span>
                    ) : null}
                    {canEdit && onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(c.id)}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--color-pmb-green)] px-3 py-1 text-[11px] font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
