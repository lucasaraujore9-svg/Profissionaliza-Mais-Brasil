import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { loadPmbTecnicaConfig, tecnicaFromTenant } from "@/lib/catalog/tecnica"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getRequestOrigin } from "@/lib/seo/host"
import { normalizeSocialUrl, buildTenantSupportContacts } from "@/lib/branding"
import { vitrineDomain } from "@/lib/tenant/urls"
import { JsonLd } from "@/components/seo/json-ld"
import {
  organizationJsonLd,
  storeJsonLd,
  webSiteJsonLd,
} from "@/lib/seo/jsonld"
import { VisitorTracker } from "@/components/loja/visitor-tracker"
import { resolveVitrinePixels, resolvePmbSelfPixels } from "@/lib/tracking/resolve"
import { TrackingPixels } from "@/components/shared/tracking-pixels"
import { isPmbAutomationEnabled } from "@/lib/automation/context"

const PMB_GREEN_DEFAULT = "#025918"
const PMB_GOLD_DEFAULT = "#F2B705"

function isCustomColor(value: string | null | undefined, fallback: string): boolean {
  if (!value) return false
  return value.toLowerCase() !== fallback.toLowerCase()
}

// Título/descrição/favicon por contexto: no domínio do revendedor puxam o nome,
// a descrição e a logo da unidade; sem tenant, a identidade institucional PMB.
// O `template` faz cada subpágina (que define só o título relativo, ex.
// "Quem somos") sair como "Quem somos · {nome da unidade}".
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const name = tenant?.name ?? "Profissionaliza Mais Brasil"
  const description = tenant
    ? tenant.description ??
      tenant.tagline ??
      `Cursos profissionalizantes online com certificado na vitrine ${name}.`
    : "Cursos profissionalizantes online com certificado reconhecido nacionalmente. Estude pelo celular, pague no Pix e ganhe uma profissão no seu ritmo."

  return {
    title: { default: name, template: `%s · ${name}` },
    description,
    ...(tenant?.logoUrl
      ? { icons: { icon: [{ url: tenant.logoUrl }], apple: [{ url: tenant.logoUrl }] } }
      : {}),
  }
}

// O grupo (main) é servido tanto no domínio institucional da PMB quanto, em
// subdomínios de revendedor, nas rotas que NÃO são reescritas para /loja
// (ex: /sobre, /ajuda, /termos, /como-funciona). Quando há tenant no contexto
// da requisição (header x-tenant-slug setado pelo proxy), cabeçalho e rodapé
// precisam carregar a identidade da unidade — não a da PMB.
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categorias, tenant, origin] = await Promise.all([
    loadCategorias(),
    getCurrentTenant(),
    getRequestOrigin(),
  ])

  // Sem tenant = site institucional PMB (comportamento original).
  if (!tenant) {
    const [tecnica, pmbAutomationOn, pmbPixels] = await Promise.all([
      loadPmbTecnicaConfig(),
      isPmbAutomationEnabled(),
      resolvePmbSelfPixels(),
    ])
    return (
      <>
        <TrackingPixels pixels={pmbPixels} />
        {pmbAutomationOn ? <VisitorTracker /> : null}
        <JsonLd
          data={[
            organizationJsonLd(),
            webSiteJsonLd({ searchPath: "/cursos?q=" }),
          ]}
        />
        <NavbarMain
          categorias={categorias}
          tecnica={{ enabled: tecnica.enabled, label: tecnica.label, url: tecnica.url }}
        />
        <main className="flex-1">{children}</main>
        <FooterMain categorias={categorias} />
      </>
    )
  }

  // Com tenant: aplica a identidade da unidade (mesma lógica do loja/layout).
  const primary = tenant.primaryColor ?? PMB_GREEN_DEFAULT
  const secondary = tenant.secondaryColor ?? PMB_GOLD_DEFAULT

  const customStyle: React.CSSProperties = {}
  if (isCustomColor(tenant.primaryColor, PMB_GREEN_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-green": primary,
      "--color-pmb-green-700": primary,
      "--color-pmb-green-900": primary,
    })
  }
  if (isCustomColor(tenant.secondaryColor, PMB_GOLD_DEFAULT)) {
    Object.assign(customStyle, {
      "--color-pmb-gold": secondary,
      "--color-pmb-gold-600": secondary,
    })
  }

  const instagramUrl = normalizeSocialUrl(tenant.instagram, "instagram")
  const facebookUrl = normalizeSocialUrl(tenant.facebook, "facebook")
  const sameAs = [instagramUrl, facebookUrl].filter(
    (v): v is string => Boolean(v),
  )

  const sejaRevendedorHref = tenant.referralCode
    ? `https://www.${vitrineDomain()}/seja-revendedor?ref=${encodeURIComponent(tenant.referralCode)}`
    : undefined

  const tecnica = tecnicaFromTenant(tenant)
  const pixels = await resolveVitrinePixels(tenant.id)

  return (
    <div style={customStyle} className="contents">
      <TrackingPixels pixels={pixels} />
      {tenant.automationEnabled ? <VisitorTracker /> : null}
      {origin ? (
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
              searchPath: "/cursos?q=",
            }),
          ]}
        />
      ) : null}
      <NavbarMain
        categorias={categorias}
        tenantLogoUrl={tenant.logoUrl ?? null}
        tenantName={tenant.name ?? null}
        tecnica={{ enabled: tecnica.enabled, label: tecnica.label, url: tecnica.url }}
        courseHrefBase="/curso"
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
        brand={{
          name: tenant.name,
          logoUrl: tenant.logoUrl,
          description: tenant.description ?? tenant.tagline,
        }}
        support={buildTenantSupportContacts({
          whatsapp: tenant.whatsapp,
          supportEmail: tenant.supportEmail,
          supportHours: tenant.supportHours,
        })}
      />
    </div>
  )
}
