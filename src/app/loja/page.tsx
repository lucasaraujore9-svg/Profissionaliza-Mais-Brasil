import { HeroBanner } from "@/components/loja/hero-banner"
import { CategoryPills } from "@/components/loja/category-pills"
import { FeaturedSection } from "@/components/loja/featured-section"
import { CourseGrid } from "@/components/loja/course-grid"
import { getCurrentTenant } from "@/lib/tenant/current"
import { listTenantCourses, listTenantCategories } from "@/lib/tenant/courses"

interface LojaHomePageProps {
  searchParams: Promise<{
    category?: string
    search?: string
  }>
}

export default async function LojaHomePage({
  searchParams,
}: LojaHomePageProps) {
  const tenant = await getCurrentTenant()
  const { category, search } = await searchParams

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">
          Vitrine indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja. Verifique o endereço e tente
          novamente.
        </p>
      </div>
    )
  }

  const [{ items, total }, categories, featured] = await Promise.all([
    listTenantCourses({
      tenantId: tenant.id,
      category,
      search,
      limit: 24,
    }),
    listTenantCategories(tenant.id),
    listTenantCourses({ tenantId: tenant.id, limit: 3 }).then((r) =>
      r.items.filter((i) => i.isFeatured).slice(0, 3),
    ),
  ])

  return (
    <>
      <HeroBanner />
      <CategoryPills categories={categories} activeCategory={category} />
      <FeaturedSection items={featured} />
      <CourseGrid items={items} total={total} />
    </>
  )
}
