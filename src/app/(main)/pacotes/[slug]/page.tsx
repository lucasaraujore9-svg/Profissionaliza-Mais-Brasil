import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getVitrinePackageBySlug } from "@/lib/packages/vitrine"
import { PackageDetailView } from "@/components/loja/package-detail-view"

interface PackagePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PackagePageProps): Promise<Metadata> {
  const { slug } = await params
  const pkg = await getVitrinePackageBySlug(null, slug)
  if (!pkg) return { title: "Pacote não encontrado" }
  return {
    title: `${pkg.name} — Profissionaliza Mais Brasil`,
    description:
      (pkg.description ?? "").slice(0, 160) ||
      `Pacote com ${pkg.courseCount} cursos profissionalizantes.`,
    alternates: { canonical: `/pacotes/${pkg.slug}` },
  }
}

export default async function PmbPackagePage({ params }: PackagePageProps) {
  const { slug } = await params
  const pkg = await getVitrinePackageBySlug(null, slug)
  if (!pkg) notFound()

  return (
    <PackageDetailView
      pkg={pkg}
      ctaHref={`/checkout?package_id=${pkg.id}`}
      ctaLabel="Comprar pacote"
      backHref="/cursos"
      backLabel="Voltar para o catálogo"
    />
  )
}

export const dynamic = "force-dynamic"
