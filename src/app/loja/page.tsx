import { HeroBanner } from "@/components/main/home/hero-banner"
import { DynamicHomeSections } from "@/components/main/home/dynamic-home-sections"
import { getCurrentTenant } from "@/lib/tenant/current"
import { prisma } from "@/lib/prisma"
import { loadShowcase } from "@/lib/catalog/home"

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

  const [showcase, bannerSlides] = await Promise.all([
    loadShowcase(tenant.id),
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

  return (
    <>
      <HeroBanner showcase={showcase} slides={bannerSlides} />
      {/* "Cursos Técnicos" entra como HomeSection (kind="tecnica") dentro de
          DynamicHomeSections — conteúdo/link padronizados pela PMB; a unidade
          só reordena e liga/desliga na aba "Seções da home". */}
      <DynamicHomeSections tenantId={tenant.id} />
    </>
  )
}
