import { HeroCTA } from "@/components/main/hero-cta"
import { VantagensQuadrinhos } from "@/components/main/vantagens-quadrinhos"
import { ManifestoFundador } from "@/components/main/manifesto-fundador"
import { CatalogoPreview } from "@/components/main/catalogo-preview"
import { PlanoUnico } from "@/components/main/plano-unico"
import { ComoFuncionaSection } from "@/components/main/como-funciona-section"
import { DepoimentosSection } from "@/components/main/depoimentos-section"
import { CTABannerMid } from "@/components/main/cta-banner-mid"
import { AutoridadePMB } from "@/components/main/autoridade-pmb"
import { FAQAccordion } from "@/components/main/faq-accordion"
import { FormularioInteresse } from "@/components/main/formulario-interesse"
import { LandingAnimations } from "@/components/main/anim/landing-animations"
import { faqs } from "@/components/main/faq-data"

export const metadata = {
  title:
    "Tenha o seu portal de cursos profissionalizantes | Profissionaliza Mais Brasil",
  description:
    "Empreenda na educação com um modelo inovador. Acesso a mais de 100 cursos profissionalizantes prontos, site personalizado e suporte do maior grupo educacional do Brasil. R$ 209 por mês, sem comissão.",
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

export default function SejaRevendedorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingAnimations />
      <HeroCTA />
      <VantagensQuadrinhos />
      <ManifestoFundador />
      <CatalogoPreview />
      <PlanoUnico />
      <ComoFuncionaSection />
      <DepoimentosSection />
      <CTABannerMid />
      <AutoridadePMB />
      <FAQAccordion />
      <FormularioInteresse />
    </>
  )
}
