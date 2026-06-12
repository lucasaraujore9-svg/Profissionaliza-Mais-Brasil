import type { Metadata, Viewport } from "next"
import type { CurrentTenant } from "@/lib/tenant/current"

// Cor de marca padrão (verde PMB do root layout) usada quando o tenant não
// configurou cor própria — mantém as páginas institucionais inalteradas.
const DEFAULT_THEME_COLOR = "#055918"

// Metadata do <head> de uma vitrine de revenda.
//
// O root layout (src/app/layout.tsx) define favicon, og:image, autoria,
// keywords, apple web app e sinais geográficos com a identidade institucional
// da PMB. Como o Next mescla metadata por segmento, qualquer campo que a
// vitrine NÃO sobrescreva é herdado do root — e a marca PMB vaza no <head> da
// revenda (favicon, preview de compartilhamento, author/creator/publisher,
// geo). Esta função sobrescreve explicitamente TODOS esses campos.
//
// Revenda sem logo própria fica SEM favicon/og:image (em vez de herdar os da
// PMB): o navegador usa o ícone padrão até o revendedor subir a própria logo.
export function tenantVitrineMetadata(
  tenant: CurrentTenant | null,
  origin: string | null,
): Metadata {
  const name = tenant?.name ?? "Cursos Online"
  const description =
    tenant?.description ??
    tenant?.tagline ??
    `Cursos profissionalizantes online com certificado na vitrine ${name}.`

  // Favicon = logo do revendedor. Sem logo, lista vazia para NÃO herdar a
  // favicon da PMB (combinado com a remoção de src/app/favicon.ico).
  const icons: Metadata["icons"] = tenant?.logoUrl
    ? { icon: [{ url: tenant.logoUrl }], apple: [{ url: tenant.logoUrl }] }
    : { icon: [] }

  // Imagem de preview (og/twitter) = banner ou logo da unidade. Sem nenhum,
  // sem imagem — nunca cai no ícone institucional da PMB.
  const ogImage = tenant?.bannerUrl ?? tenant?.logoUrl ?? null

  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description,
    applicationName: name,
    authors: [{ name }],
    creator: name,
    publisher: name,
    keywords: [
      "cursos profissionalizantes",
      "cursos online",
      "cursos com certificado",
      name,
    ],
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
    // Manifest PWA dinâmico: nome, cor e ícone da unidade (não o da PMB).
    manifest: "/api/vitrine/manifest",
    icons,
    alternates: origin ? { canonical: "/" } : undefined,
    // Sinais geográficos genéricos (Brasil) re-emitidos aqui para não herdar
    // o `other` institucional do root layout.
    other: {
      "geo.region": "BR",
      "geo.placename": "Brasil",
    },
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
      ...(ogImage ? { images: [{ url: ogImage, alt: name }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: name,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

// Viewport da vitrine: a cor do tema (barra do navegador / chrome do PWA) passa
// a ser a primaryColor da unidade, em vez do verde institucional da PMB. Sem cor
// custom, cai no verde padrão — mantendo as páginas PMB inalteradas. Repete os
// demais campos do root porque exportar generateViewport substitui o viewport
// herdado por completo.
export function tenantVitrineViewport(tenant: CurrentTenant | null): Viewport {
  return {
    themeColor: tenant?.primaryColor ?? DEFAULT_THEME_COLOR,
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
  }
}
