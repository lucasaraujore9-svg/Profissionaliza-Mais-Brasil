import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getVitrinePackageBySlug } from "@/lib/packages/vitrine"
import { PackageDetailView } from "@/components/loja/package-detail-view"

interface PackagePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PackagePageProps): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const { slug } = await params
  if (!tenant) return { title: "Pacote" }
  const pkg = await getVitrinePackageBySlug(tenant.id, slug)
  if (!pkg) return { title: "Pacote não encontrado" }
  return {
    title: `${pkg.name} — ${tenant.name}`,
    description:
      (pkg.description ?? "").slice(0, 160) ||
      `Pacote com ${pkg.courseCount} cursos na vitrine ${tenant.name}.`,
    alternates: { canonical: `/pacote/${pkg.slug}` },
  }
}

export default async function PackagePage({ params }: PackagePageProps) {
  const tenant = await getCurrentTenant()
  const { slug } = await params

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Pacote indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja.
        </p>
      </div>
    )
  }

  const pkg = await getVitrinePackageBySlug(tenant.id, slug)
  if (!pkg) notFound()

  return (
    <PackageDetailView
      pkg={pkg}
      ctaHref={`/checkout?package_id=${pkg.id}`}
      ctaLabel="Comprar pacote"
      backHref="/"
      backLabel="Voltar para a loja"
    />
  )
}

export const dynamic = "force-dynamic"
