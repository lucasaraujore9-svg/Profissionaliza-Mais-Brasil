import Link from "next/link"

/**
 * Paginação server-side do catálogo público (PERF-003). Sem estado de client:
 * navega por querystring `?page=N`, preservando `q`/`categoria`. Renderiza nada
 * quando há uma única página. O `basePath` é o mesmo em PMB e vitrine (`/cursos`).
 */
export function CatalogPager({
  basePath,
  page,
  totalPages,
  q,
  categoria,
}: {
  basePath: string
  page: number
  totalPages: number
  q?: string
  categoria?: string
}) {
  if (totalPages <= 1) return null

  const href = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (categoria) params.set("categoria", categoria)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const hasPrev = page > 1
  const hasNext = page < totalPages

  const linkClass =
    "rounded-lg border border-[rgba(2,89,24,0.15)] px-4 py-2 text-[13px] font-semibold text-[var(--color-pmb-green)] transition-colors hover:border-[var(--color-pmb-green)]"
  const disabledClass =
    "rounded-lg border border-[rgba(2,89,24,0.08)] px-4 py-2 text-[13px] font-semibold text-[rgba(2,89,24,0.35)]"

  return (
    <nav
      className="mt-10 flex items-center justify-center gap-3"
      aria-label="Paginação do catálogo"
    >
      {hasPrev ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          Anterior
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Anterior
        </span>
      )}

      <span className="text-[13px] font-semibold text-[rgba(2,89,24,0.7)]">
        Página {page} de {totalPages}
      </span>

      {hasNext ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          Próxima
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Próxima
        </span>
      )}
    </nav>
  )
}
