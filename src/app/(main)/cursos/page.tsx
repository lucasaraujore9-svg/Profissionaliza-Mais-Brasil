import Link from "next/link"
import { Search } from "lucide-react"
import { CourseCard } from "@/components/main/home/course-card"
import { SearchAutocomplete } from "@/components/shared/search-autocomplete"
import { CatalogPager } from "@/components/shared/catalog-pager"
import { loadCatalogo, loadCategorias } from "@/lib/catalog/home"
import { RegulamentacaoNote } from "@/components/shared/regulamentacao-note"

// PERF-003: catálogo paginado server-side (evita carregar 112+ cursos por load).
const PAGE_SIZE = 24

export default async function CursosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() || ""
  const categoriaSlug = sp.categoria?.trim() || ""
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  const [{ cursos, total }, categorias] = await Promise.all([
    loadCatalogo({ q, categoriaSlug, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    loadCategorias(0),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Busca sem resultados: em vez de deixar a página vazia ("fica vago"),
  // mostramos a 1ª página do catálogo completo logo abaixo da mensagem.
  const semResultados = cursos.length === 0 && Boolean(q || categoriaSlug)
  const { cursos: todosOsCursos } = semResultados
    ? await loadCatalogo({ take: PAGE_SIZE })
    : { cursos: [] }

  const categoriaAtiva = categorias.find((c) => c.slug === categoriaSlug)
  const tituloAtivo = categoriaAtiva ? categoriaAtiva.nome : "Todos os cursos"

  return (
    <div className="bg-[var(--color-pmb-mist)]">
      <section className="bg-[var(--color-pmb-green)] text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
            Catálogo completo
          </p>
          <h1 className="mt-1 text-[28px] font-black leading-tight md:text-[40px]">{tituloAtivo}</h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-white/80">
            Cursos profissionalizantes com certificado. Compre uma vez, assista quando quiser.
          </p>

          <form action="/cursos" method="get" className="mt-6 flex max-w-xl items-center gap-2 rounded-xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.3)]">
            <Search className="ml-2 h-5 w-5 text-[var(--color-pmb-green)]" aria-hidden />
            <SearchAutocomplete
              id="cursos-search"
              defaultValue={q}
              placeholder="Buscar curso por nome..."
              wrapperClassName="relative flex-1"
              inputClassName="w-full bg-transparent text-[14px] text-[var(--color-pmb-green)] placeholder:text-[rgba(2,89,24,0.5)] focus:outline-none"
            />
            {categoriaSlug && <input type="hidden" name="categoria" value={categoriaSlug} />}
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)] transition-colors hover:brightness-105"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap gap-2 px-4 py-4 md:px-6">
          <Link
            href="/cursos"
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              !categoriaSlug
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                : "border-[rgba(2,89,24,0.15)] text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
            }`}
          >
            Todas
          </Link>
          {categorias.map((cat) => {
            const isActive = cat.slug === categoriaSlug
            return (
              <Link
                key={cat.slug}
                href={`/cursos?categoria=${cat.slug}`}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                    : "border-[rgba(2,89,24,0.15)] text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
                }`}
              >
                {cat.nome}
              </Link>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {cursos.length === 0 ? (
          <div>
            <div className="rounded-xl border border-dashed border-[rgba(2,89,24,0.2)] bg-white p-8 text-center">
              <p className="text-[16px] font-bold text-[var(--color-pmb-green)]">
                Nenhum curso encontrado{q && ` para "${q}"`}
              </p>
              <p className="mt-1 text-[13.5px] text-[rgba(2,89,24,0.7)]">
                {todosOsCursos.length > 0
                  ? "Que tal dar uma olhada em todos os cursos disponíveis?"
                  : "Tente outra busca ou categoria."}
              </p>
            </div>
            {todosOsCursos.length > 0 && (
              <>
                <p className="mb-5 mt-8 text-[13px] font-bold text-[var(--color-pmb-green)]">
                  Todos os cursos disponíveis
                </p>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {todosOsCursos.map((c) => (
                    <li key={c.slug}>
                      <CourseCard course={c} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mb-5 text-[13px] text-[rgba(2,89,24,0.7)]">
              {total} {total === 1 ? "curso encontrado" : "cursos encontrados"}
              {q && ` para "${q}"`}
            </p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {cursos.map((c) => (
                <li key={c.slug}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
            <CatalogPager
              basePath="/cursos"
              page={page}
              totalPages={totalPages}
              q={q || undefined}
              categoria={categoriaSlug || undefined}
            />
          </>
        )}

        <RegulamentacaoNote className="mt-10" />
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
