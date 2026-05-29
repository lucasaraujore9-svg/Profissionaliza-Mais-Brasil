import type { Metadata } from "next"
import { LivrecursosHeader } from "@/components/livrecursos/header"
import { LivrecursosFooter } from "@/components/livrecursos/footer"
import { JsonLd } from "@/components/seo/json-ld"
import { vitrineDomain } from "@/lib/tenant/urls"
import { GEO } from "@/lib/seo/site"

const LIVRECURSOS_URL = `https://${vitrineDomain()}`
const LIVRECURSOS_DESCRIPTION =
  "Monte sua revenda de cursos profissionalizantes online com vitrine pronta, domínio próprio e checkout integrado."

export const metadata: Metadata = {
  metadataBase: new URL(LIVRECURSOS_URL),
  title: {
    default: "Livre Cursos · Vitrines para quem ensina",
    template: "%s · Livre Cursos",
  },
  description: LIVRECURSOS_DESCRIPTION,
  applicationName: "Livre Cursos",
  alternates: { canonical: "/" },
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
    siteName: "Livre Cursos",
    locale: GEO.ogLocale,
    url: LIVRECURSOS_URL,
    title: "Livre Cursos · Vitrines para quem ensina",
    description: LIVRECURSOS_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Livre Cursos · Vitrines para quem ensina",
    description: LIVRECURSOS_DESCRIPTION,
  },
}

export default function LivrecursosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${LIVRECURSOS_URL}/#organization`,
            name: "Livre Cursos",
            url: LIVRECURSOS_URL,
            description: LIVRECURSOS_DESCRIPTION,
            inLanguage: GEO.language,
            areaServed: { "@type": "Country", name: GEO.countryName },
          },
          {
            "@context": "https://schema.org",
            "@type": "Service",
            name: "Revenda de cursos profissionalizantes",
            serviceType: "Plataforma de vitrines white-label",
            description: LIVRECURSOS_DESCRIPTION,
            areaServed: { "@type": "Country", name: GEO.countryName },
            provider: {
              "@type": "Organization",
              name: "Livre Cursos",
              url: LIVRECURSOS_URL,
            },
          },
        ]}
      />
      <LivrecursosHeader />
      <main className="flex-1">{children}</main>
      <LivrecursosFooter />
    </div>
  )
}
