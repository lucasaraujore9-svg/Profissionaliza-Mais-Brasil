import { HeroBanner } from "@/components/main/home/hero-banner"
import { TecnicaSection } from "@/components/main/home/tecnica-section"
import { DynamicHomeSections } from "@/components/main/home/dynamic-home-sections"
import { prisma } from "@/lib/prisma"
import { loadShowcase } from "@/lib/catalog/home"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"

export const dynamic = "force-dynamic"

export default async function LandingPage() {
  const [showcase, bannerSlides, tecnica] = await Promise.all([
    loadShowcase(),
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
      <DynamicHomeSections tenantId={null} />
      {tecnica.enabled && (
        <TecnicaSection
          label={tecnica.label}
          courses={tecnica.courses}
          fallbackUrl={tecnica.url}
        />
      )}
    </>
  )
}
