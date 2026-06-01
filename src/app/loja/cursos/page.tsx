import Link from "next/link"
import { Search } from "lucide-react"
import { CourseCard, type Course } from "@/components/main/home/course-card"
import { getCurrentTenant } from "@/lib/tenant/current"
import {
  listTenantCatalog,
  type TenantCourseListItem,
} from "@/lib/tenant/courses"

export const dynamic = "force-dynamic"

function formatPrice(value: number): string {
  if (!value || value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

// Converte o item de catalogo do tenant para o shape do CourseCard, preservando
// preco/capa/parcelas da unidade (nunca do catalogo global PMB).
function toCourse(item: TenantCourseListItem, idx: number): Course {
  const isMonthly = item.paymentType === "MONTHLY"
  const parcelasLabel = isMonthly
    ? item.monthlyMonths
      ? `${item.monthlyMonths} mensalidades`
      : "Mensal"
    : item.parcelas
      ? `${item.parcelas}x sem juros`
      : ""
  return {
    slug: item.slug,
    categoria: item.categoria ?? "Curso profissionalizante",
    titulo: item.nome,
    horas: item.horas ? `${item.horas}h` : "Online",
    preco: formatPrice(item.price),
    precoDe:
      item.originalPrice && item.originalPrice > item.price
        ? formatPrice(item.originalPrice)
        : undefined,
    parcelas: parcelasLabel,
    paymentType: item.paymentType,
    selo: item.isFeatured ? "mais-vendido" : null,
    accent: idx % 2 === 0 ? "gold" : "green",
    imageUrl: item.imageUrl,
  }
}

export default async function LojaCursosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>
}) {
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Vitrine indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja. Verifique o endereço e tente
          novamente.
        </p>
      </div>
    )
  }

  const sp = await searchParams
  const q = sp.q?.trim() || ""
  const categoriaSlug = sp.categoria?.trim() || ""

  const { items, total, categories } = await listTenantCatalog({
    tenantId: tenant.id,
    categorySlug: categoriaSlug,
    search: q,
  })

  const categoriaAtiva = categories.find((c) => c.slug === categoriaSlug)
  const tituloAtivo = categoriaAtiva ? categoriaAtiva.nome : "Todos os cursos"
  const cursos = items.map(toCourse)

  return (
    <div className="bg-[var(--color-pmb-mist)]">
      <section className="bg-[var(--color-pmb-green)] text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
            Catálogo completo
          </p>
          <h1 className="mt-1 text-[28px] font-black leading-tight md:text-[40px]">
            {tituloAtivo}
          </h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-white/80">
            Cursos profissionalizantes com certificado. Compre uma vez, assista
            quando quiser.
          </p>

          <form
            action="/cursos"
            method="get"
            className="mt-6 flex max-w-xl items-center gap-2 rounded-xl bg-white p-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.3)]"
          >
            <Search
              className="ml-2 h-5 w-5 text-[var(--color-pmb-green)]"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar curso por nome..."
              className="flex-1 bg-transparent text-[14px] text-[var(--color-pmb-green)] placeholder:text-[rgba(2,89,24,0.5)] focus:outline-none"
            />
            {categoriaSlug && (
              <input type="hidden" name="categoria" value={categoriaSlug} />
            )}
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)] transition-colors hover:brightness-105"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {categories.length > 0 && (
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
            {categories.map((cat) => {
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
      )}

      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        {cursos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(2,89,24,0.2)] bg-white p-12 text-center">
            <p className="text-[16px] font-bold text-[var(--color-pmb-green)]">
              Nenhum curso encontrado
            </p>
            <p className="mt-1 text-[13.5px] text-[rgba(2,89,24,0.7)]">
              Tente outra busca ou categoria.
            </p>
            <Link
              href="/cursos"
              className="mt-4 inline-block rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)]"
            >
              Ver todos os cursos
            </Link>
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
                  <CourseCard course={c} hrefBase="/curso" />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
