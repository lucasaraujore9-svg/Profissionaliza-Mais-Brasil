import { Suspense } from "react"
import { HeroCTA } from "@/components/main/hero-cta"
import { VantagensQuadrinhos } from "@/components/main/vantagens-quadrinhos"
import { ManifestoFundador } from "@/components/main/manifesto-fundador"
import { CatalogoPreview } from "@/components/main/catalogo-preview"
import { AutomacaoSection } from "@/components/main/automacao-section"
import { PlanosPMB } from "@/components/main/planos-pmb"
import { ComoFuncionaSection } from "@/components/main/como-funciona-section"
import { DepoimentosSection } from "@/components/main/depoimentos-section"
import { CTABannerMid } from "@/components/main/cta-banner-mid"
import { AutoridadePMB } from "@/components/main/autoridade-pmb"
import { FAQAccordion } from "@/components/main/faq-accordion"
import { FormularioInteresse } from "@/components/main/formulario-interesse"
import { LandingAnimations } from "@/components/main/anim/landing-animations"
import { faqs } from "@/components/main/faq-data"
import { RefCookieCapture } from "@/components/shared/ref-cookie-capture"

export const metadata = {
  title:
    "Tenha o seu portal de cursos profissionalizantes | Profissionaliza Mais Brasil",
  description:
    "Empreenda na educação com um modelo inovador. Mais de 100 cursos profissionalizantes prontos, site personalizado e suporte do maior grupo educacional do Brasil. A partir de R$ 209/mês, sem comissão — ou R$ 239/mês com a Automação que vende no WhatsApp por você.",
}

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.pergunta,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.resposta,
    },
  })),
}

export default async function SejaRevendedorPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const sp = await searchParams
  const initialRef = typeof sp.ref === "string" ? sp.ref.trim() : ""
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingAnimations />
      <Suspense fallback={null}>
        <RefCookieCapture />
      </Suspense>
      <HeroCTA />
      <VantagensQuadrinhos />
      <ManifestoFundador />
      <CatalogoPreview />
      <AutomacaoSection />
      <PlanosPMB />
      <ComoFuncionaSection />
      <DepoimentosSection />
      <CTABannerMid />
      <AutoridadePMB />
      <FAQAccordion />
      <FormularioInteresse initialRef={initialRef} />
    </>
  )
}
