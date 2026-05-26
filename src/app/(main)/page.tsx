import { HeroBanner } from "@/components/main/home/hero-banner"
import { TrustBar } from "@/components/main/home/trust-bar"
import { CategoriesGrid } from "@/components/main/home/categories-grid"
import { LearnAnywhere } from "@/components/main/home/learn-anywhere"
import { Testimonials } from "@/components/main/home/testimonials"
import { FinalCta } from "@/components/main/home/final-cta"
import { TecnicaSection } from "@/components/main/home/tecnica-section"
import { DynamicHomeSections } from "@/components/main/home/dynamic-home-sections"
import { prisma } from "@/lib/prisma"
import { loadShowcase, loadCategorias } from "@/lib/catalog/home"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"

// Home tem secoes dinamicas que escrevem cookies (snapshot do bestsellers
// random por sessao) — exige render dinamico.
export const dynamic = "force-dynamic"

export default async function LandingPage() {
  const [showcase, categorias, bannerSlides, tecnica] = await Promise.all([
    loadShowcase(),
    loadCategorias(),
    prisma.bannerSlide.findMany({
      where: { tenantId: null, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        desktopUrl: true,
        mobileUrl: true,
        linkUrl: true,
      },
    }),
    loadPmbTecnicaConfig(),
  ])

  return (
    <>
      <HeroBanner showcase={showcase} slides={bannerSlides} />
      <TrustBar />
      <CategoriesGrid
        categorias={categorias}
        tecnicaEnabled={tecnica.enabled}
        tecnicaLabel={tecnica.label}
      />
      <DynamicHomeSections tenantId={null} />
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
