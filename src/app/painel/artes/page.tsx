import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publicUrlFor } from "@/lib/supabase/storage"
import { activeCustomDomain, vitrineHost } from "@/lib/tenant/urls"
import { normalizeSocialHandle, type ArtItem, type TenantBrand } from "@/lib/artes/types"
import { PageHeader } from "@/components/painel/page-header"
import { ArtesGrid } from "@/components/painel/artes/artes-grid"

export const metadata = {
  title: "Artes de divulgação | Painel",
}

export default async function PainelArtesPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/artes")
  }
  const tenantId = session.user.tenantId

  const [arts, tenant] = await Promise.all([
    prisma.marketingArt.findMany({
      where: { published: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        filePath: true,
        width: true,
        height: true,
        hasPrice: true,
        logoCorner: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        customDomain: true,
        domainVerified: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        whatsapp: true,
        instagram: true,
        facebook: true,
        youtube: true,
        tiktok: true,
      },
    }),
  ])

  if (!tenant) redirect("/login?callbackUrl=/painel/artes")

  const items: ArtItem[] = arts.map((art) => ({
    id: art.id,
    title: art.title,
    category: art.category,
    url: publicUrlFor(art.filePath),
    width: art.width,
    height: art.height,
    hasPrice: art.hasPrice,
    logoCorner: art.logoCorner === "top-left" ? "top-left" : "top-right",
  }))

  // Primeira rede social disponivel vira o item do rodape.
  const social =
    normalizeSocialHandle(tenant.instagram) ??
    normalizeSocialHandle(tenant.facebook) ??
    normalizeSocialHandle(tenant.youtube) ??
    normalizeSocialHandle(tenant.tiktok)

  const brand: TenantBrand = {
    name: tenant.name,
    slug: tenant.slug,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    siteHost: activeCustomDomain(tenant) ?? vitrineHost(tenant.slug),
    whatsapp: tenant.whatsapp,
    social,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artes de divulgação"
        description="Escolha as artes e baixe já personalizadas com o logo, site, WhatsApp e rede social da sua unidade."
      />
      <ArtesGrid arts={items} brand={brand} />
    </div>
  )
}
