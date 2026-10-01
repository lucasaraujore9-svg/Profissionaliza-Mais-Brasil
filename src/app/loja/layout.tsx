import type { Metadata, Viewport } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { getCurrentTenant } from "@/lib/tenant/current"
import { hasVitrinePlans } from "@/lib/subscriptions/plans"
import { resolveVitrinePixels, resolvePmbSelfPixels } from "@/lib/tracking/resolve"
import { TrackingPixels } from "@/components/shared/tracking-pixels"
import { tecnicaFromTenant } from "@/lib/catalog/tecnica"
import { getRequestOrigin, classifyRequestHost } from "@/lib/seo/host"
import { normalizeSocialUrl, buildTenantSupportContacts } from "@/lib/branding"
import { vitrineDomain } from "@/lib/tenant/urls"
import { JsonLd } from "@/components/seo/json-ld"
import { storeJsonLd, webSiteJsonLd } from "@/lib/seo/jsonld"
import { tenantVitrineMetadata, tenantVitrineViewport } from "@/lib/seo/tenant-metadata"
import { VisitorTracker } from "@/components/loja/visitor-tracker"
import { WhatsappFloat } from "@/components/loja/whatsapp-float"
import { TenantThemeStyle } from "@/components/shared/tenant-theme-style"
import { logoForTone, resolveTheme } from "@/lib/tenant/theme"

// Metadata por revenda: título, descrição, favicon (logo do tenant), canonical,
// Open Graph, autoria e sinais geográficos — todos da unidade, sobrescrevendo
// a identidade institucional da PMB definida no root layout.
export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([
    getCurrentTenant(),
    getRequestOrigin(),
  ])

  return tenantVitrineMetadata(tenant, origin)
}

// Cor do tema (barra do navegador / PWA) = primaryColor da unidade.
export async function generateViewport(): Promise<Viewport> {
  const tenant = await getCurrentTenant()
  return tenantVitrineViewport(tenant)
}

export default async function LojaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categorias, tenant, origin, host] = await Promise.all([
    loadCategorias(),
    getCurrentTenant(),
    getRequestOrigin(),
    classifyRequestHost(),
  ])

  // O link de assinaturas só aparece quando esta loja tem plano vendável —
  // caso contrário levaria a uma listagem vazia.
  const hasPlans = tenant ? await hasVitrinePlans(tenant.id) : false

  // Domínio próprio do revendedor (host não bate em PMB nem em
  // livrecursos.com.br) → kind "unknown". Nesse contexto ocultamos o link
  // "Seja um Parceiro" do rodapé; no subdomínio livrecursos.com.br ele fica.
  const isCustomDomain = host.kind === "unknown"

  // Pixels: vitrine do revendedor = global PMB + revenda; sem tenant = self PMB.
  const pixels = tenant
    ? await resolveVitrinePixels(tenant.id)
    : await resolvePmbSelfPixels()

  // Identidade da unidade: cores em :root (TenantThemeStyle) e, aqui, o que é
  // estrutura — tom do topo e do rodapé e a logo certa para cada fundo.
  const theme = resolveTheme({
    primaryColor: tenant?.primaryColor,
    secondaryColor: tenant?.secondaryColor,
    theme: tenant?.theme,
  })
  const headerLogo = logoForTone(theme.headerTone, tenant ?? {})
  const footerLogo = logoForTone(theme.footerTone, tenant ?? {})

  // Redes sociais do revendedor, normalizadas (handle/@/URL → URL absoluta).
  const instagramUrl = normalizeSocialUrl(tenant?.instagram, "instagram")
  const facebookUrl = normalizeSocialUrl(tenant?.facebook, "facebook")
  const youtubeUrl = normalizeSocialUrl(tenant?.youtube, "youtube")
  const tiktokUrl = normalizeSocialUrl(tenant?.tiktok, "tiktok")

  // JSON-LD da vitrine (Store) + WebSite — só faz sentido com tenant + origem.
  const sameAs = [instagramUrl, facebookUrl, youtubeUrl, tiktokUrl].filter(
    (v): v is string => Boolean(v),
  )

  // Link "Seja revendedor" do rodapé desta unidade → carrega o referralCode do
  // tenant para atribuir a indicação ao dono da vitrine. Aponta sempre para o
  // domínio canônico de captação. Sem referralCode (tenant legado) cai no link
  // padrão sem ref.
  const sejaRevendedorHref = tenant?.referralCode
    ? `https://www.${vitrineDomain()}/seja-revendedor?ref=${encodeURIComponent(tenant.referralCode)}`
    : undefined

  return (
    <div className="contents">
      <TenantThemeStyle tenant={tenant} />
      <TrackingPixels pixels={pixels} />
      {tenant?.automationEnabled ? <VisitorTracker /> : null}
      {tenant && origin ? (
        <JsonLd
          data={[
            storeJsonLd({
              name: tenant.name,
              url: origin,
              logo: tenant.logoUrl,
              description: tenant.description ?? tenant.tagline,
              sameAs,
            }),
            webSiteJsonLd({
              name: tenant.name,
              url: origin,
              searchPath: "/?q=",
            }),
          ]}
        />
      ) : null}
      <NavbarMain
        categorias={categorias}
        tenantLogoUrl={headerLogo.url}
        tenantName={tenant?.name ?? null}
        tone={theme.headerTone}
        tecnica={(() => {
          const t = tecnicaFromTenant(tenant)
          return { enabled: t.enabled, label: t.label, url: t.url }
        })()}
        courseHrefBase="/curso"
        hasPlans={hasPlans}
      />
      <main className="flex-1">{children}</main>
      <FooterMain
        categorias={categorias}
        showCnpj={false}
        social={{
          instagram: instagramUrl,
          facebook: facebookUrl,
          youtube: youtubeUrl,
          tiktok: tiktokUrl,
        }}
        sejaRevendedorHref={sejaRevendedorHref}
        hideSejaRevendedor={isCustomDomain}
        tone={theme.footerTone}
        brand={
          tenant
            ? {
                name: tenant.name,
                logoUrl: footerLogo.url,
                logoPlate: footerLogo.plate,
                description: tenant.description ?? tenant.tagline,
              }
            : undefined
        }
        support={
          tenant
            ? buildTenantSupportContacts({
                whatsapp: tenant.whatsapp,
                supportEmail: tenant.supportEmail,
                supportHours: tenant.supportHours,
              })
            : undefined
        }
      />
      {tenant?.whatsappFloatEnabled ? (
        <WhatsappFloat
          whatsapp={tenant.whatsapp}
          side={tenant.whatsappFloatSide}
          message={tenant.whatsappFloatMessage}
        />
      ) : null}
    </div>
  )
}
