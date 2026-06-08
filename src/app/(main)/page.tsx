import { HeroBanner } from "@/components/main/home/hero-banner"
import { Testimonials } from "@/components/main/home/testimonials"
import { DynamicHomeSections } from "@/components/main/home/dynamic-home-sections"
import { prisma } from "@/lib/prisma"
import { loadShowcase } from "@/lib/catalog/home"

export const dynamic = "force-dynamic"

export default async function LandingPage() {
  const [showcase, bannerSlides] = await Promise.all([
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
  ])

  return (
    <>
      <HeroBanner showcase={showcase} slides={bannerSlides} />
      {/* A seção "Cursos Técnicos" agora é uma HomeSection (kind="tecnica")
          renderizada dentro de DynamicHomeSections, na posição configurada na
          aba "Seções da home". */}
      <DynamicHomeSections tenantId={null} />
      <Testimonials />
    </>
  )
}
