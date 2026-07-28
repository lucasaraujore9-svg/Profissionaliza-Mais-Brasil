import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publicUrlFor } from "@/lib/supabase/storage"
import { activeCustomDomain, vitrineHost } from "@/lib/tenant/urls"
import {
  normalizeSocialHandle,
  type ArtItem,
  type SocialKind,
  type TenantBrand,
} from "@/lib/artes/types"
import { parseArtLayout } from "@/lib/artes/layout-schema"
import { PageHeader } from "@/components/painel/page-header"
import { ArtesGrid } from "@/components/painel/artes/artes-grid"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const metadata = {
  title: "Artes de divulgação | Painel",
}

export default async function PainelArtesPage() {
  await requirePainelPage("artes.view")
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
        storyFilePath: true,
        storyWidth: true,
        storyHeight: true,
        hasPrice: true,
        logoCorner: true,
        layout: true,
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
    feed: { url: publicUrlFor(art.filePath), width: art.width, height: art.height },
    story:
      art.storyFilePath && art.storyWidth && art.storyHeight
        ? {
            url: publicUrlFor(art.storyFilePath),
            width: art.storyWidth,
            height: art.storyHeight,
          }
        : null,
    hasPrice: art.hasPrice,
    logoCorner: art.logoCorner === "top-left" ? "top-left" : "top-right",
    layout: parseArtLayout(art.layout),
  }))

  // Primeira rede social disponivel vira o item do rodape (kind -> icone).
  const socialSources: Array<[SocialKind, string | null]> = [
    ["instagram", tenant.instagram],
    ["facebook", tenant.facebook],
    ["youtube", tenant.youtube],
    ["tiktok", tenant.tiktok],
  ]
  let social: TenantBrand["social"] = null
  for (const [kind, raw] of socialSources) {
    const handle = normalizeSocialHandle(raw)
    if (handle) {
      social = { kind, handle }
      break
    }
  }

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
