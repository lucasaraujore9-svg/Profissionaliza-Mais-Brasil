import { Suspense } from "react"
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
import { RefCookieCapture } from "@/components/shared/ref-cookie-capture"

// O dominio livrecursos.com.br atende como vitrine de captacao de
// revendedores: a home dele e o mesmo conteudo da /seja-revendedor servida
// no dominio institucional. Subdominios (`{slug}.livrecursos.com.br`) sao
// vitrines de revenda servidas pelo proxy (ver src/proxy.ts).
export const metadata = {
  title:
    "Seja um parceiro Profissionaliza Mais Brasil — sua escola digital pronta",
  description:
    "Empreenda na educação com um modelo inovador. Site personalizado, catálogo de cursos profissionalizantes pronto e suporte do Grupo Bolsa Mais Brasil. R$ 209 por mês, sem comissão por venda.",
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

export default function LivrecursosLandingPage() {
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
