import type { Metadata, Viewport } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { getCurrentTenant } from "@/lib/tenant/current"
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

const PMB_GREEN_DEFAULT = "#025918"
const PMB_GOLD_DEFAULT = "#F2B705"

function isCustomColor(value: string | null | undefined, fallback: string): boolean {
  if (!value) return false
  return value.toLowerCase() !== fallback.toLowerCase()
}

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

  // Domínio próprio do revendedor (host não bate em PMB nem em
  // livrecursos.com.br) → kind "unknown". Nesse contexto ocultamos o link
  // "Seja um Parceiro" do rodapé; no subdomínio livrecursos.com.br ele fica.
  const isCustomDomain = host.kind === "unknown"

  // Pixels: vitrine do revendedor = global PMB + revenda; sem tenant = self PMB.
  const pixels = tenant
    ? await resolveVitrinePixels(tenant.id)
    : await resolvePmbSelfPixels()

  const primary = tenant?.primaryColor ?? PMB_GREEN_DEFAULT
  const secondary = tenant?.secondaryColor ?? PMB_GOLD_DEFAULT

  // Só sobrescreve quando o tenant configurou cor custom
  // (evita injetar style desnecessário quando usa o default PMB)
  const customStyle: React.CSSProperties = {}
  if (isCustomColor(tenant?.primaryColor, PMB_GREEN_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-green": primary,
      "--color-pmb-green-700": primary,
      "--color-pmb-green-900": primary,
    })
  }
  if (isCustomColor(tenant?.secondaryColor, PMB_GOLD_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-gold": secondary,
      "--color-pmb-gold-600": secondary,
    })
  }

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
    <div style={customStyle} className="contents">
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
        tenantLogoUrl={tenant?.logoUrl ?? null}
        tenantName={tenant?.name ?? null}
        tecnica={(() => {
          const t = tecnicaFromTenant(tenant)
          return { enabled: t.enabled, label: t.label, url: t.url }
        })()}
        courseHrefBase="/curso"
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
        brand={
          tenant
            ? {
                name: tenant.name,
                logoUrl: tenant.logoUrl,
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
    </div>
  )
}
