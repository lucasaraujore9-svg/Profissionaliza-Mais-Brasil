import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import { TecnicaSection } from "@/components/main/home/tecnica-section"
import { DynamicHomeSections } from "@/components/main/home/dynamic-home-sections"
import { getCurrentTenant } from "@/lib/tenant/current"
import { tecnicaFromTenant } from "@/lib/catalog/tecnica"
import { prisma } from "@/lib/prisma"
import { loadShowcase, loadCategorias } from "@/lib/catalog/home"

export const dynamic = "force-dynamic"

export default async function LojaHomePage() {
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

  const [showcase, categorias, bannerSlides] = await Promise.all([
    loadShowcase(),
    loadCategorias(),
    prisma.bannerSlide.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        desktopUrl: true,
        mobileUrl: true,
        linkUrl: true,
      },
    }),
  ])

  const tecnica = tecnicaFromTenant(tenant)

  return (
    <>
      <HeroBanner
        showcase={showcase}
        tenantBannerUrl={tenant.bannerUrl}
        slides={bannerSlides}
      />
      <TrustBar />
      <CategoriesGrid
        categorias={categorias}
        tecnicaEnabled={tecnica.enabled}
        tecnicaLabel={tecnica.label}
      />
      <DynamicHomeSections tenantId={tenant.id} />
      <LearnAnywhere />
      {tecnica.enabled && (
        <TecnicaSection
          label={tecnica.label}
          courses={tecnica.courses}
          fallbackUrl={tecnica.url}
        />
      )}
      <Testimonials />
      <FinalCta />
    </>
  )
}
