import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { getCurrentTenant } from "@/lib/tenant/current"
import { tecnicaFromTenant } from "@/lib/catalog/tecnica"
import { getRequestOrigin } from "@/lib/seo/host"
import { normalizeSocialUrl } from "@/lib/branding"
import { vitrineDomain } from "@/lib/tenant/urls"
import { JsonLd } from "@/components/seo/json-ld"
import { storeJsonLd, webSiteJsonLd } from "@/lib/seo/jsonld"

const PMB_GREEN_DEFAULT = "#025918"
const PMB_GOLD_DEFAULT = "#F2B705"

// Ícones de fallback do sistema mãe (quando o revendedor não subiu logo).
const FALLBACK_ICONS: Metadata["icons"] = {
  icon: [
    { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
  ],
  apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
}

function isCustomColor(value: string | null | undefined, fallback: string): boolean {
  if (!value) return false
  return value.toLowerCase() !== fallback.toLowerCase()
}

// Metadata por revenda: título, descrição, favicon (logo do tenant), canonical
// e Open Graph apontando para o domínio da própria vitrine.
export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([
    getCurrentTenant(),
    getRequestOrigin(),
  ])

  const name = tenant?.name ?? "Cursos Online"
  const description =
    tenant?.description ??
    tenant?.tagline ??
    `Cursos profissionalizantes online com certificado na vitrine ${name}.`

  // Favicon = logo do revendedor, se houver. Senão, favicon do sistema mãe.
  const icons: Metadata["icons"] = tenant?.logoUrl
    ? { icon: [{ url: tenant.logoUrl }], apple: [{ url: tenant.logoUrl }] }
    : FALLBACK_ICONS

  const ogImage = tenant?.bannerUrl ?? tenant?.logoUrl ?? "/icons/icon-512.png"

  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description,
    applicationName: name,
    icons,
    alternates: origin ? { canonical: "/" } : undefined,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      siteName: name,
      locale: "pt_BR",
      ...(origin ? { url: origin } : {}),
      title: name,
      description,
      images: [{ url: ogImage, alt: name }],
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images: [ogImage],
    },
  }
}

export default async function LojaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categorias, tenant, origin] = await Promise.all([
    loadCategorias(),
    getCurrentTenant(),
    getRequestOrigin(),
  ])

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

  // JSON-LD da vitrine (Store) + WebSite — só faz sentido com tenant + origem.
  const sameAs = [instagramUrl, facebookUrl].filter(
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
      />
      <main className="flex-1">{children}</main>
      <FooterMain
        categorias={categorias}
        showCnpj={false}
        social={{
          instagram: instagramUrl,
          facebook: facebookUrl,
          youtube: null,
        }}
        sejaRevendedorHref={sejaRevendedorHref}
      />
    </div>
  )
}
