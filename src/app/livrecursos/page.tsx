import { HeroCTA } from "@/components/main/hero-cta"
import { BeneficiosZigZag } from "@/components/main/beneficios-zigzag"
import { TimelineDetalhada } from "@/components/main/timeline-detalhada"
import { PlanosComparativo } from "@/components/main/planos-comparativo"
import { FAQAccordion } from "@/components/main/faq-accordion"
import { FormularioInteresse } from "@/components/main/formulario-interesse"

export default function LivrecursosLandingPage() {
  return (
    <>
      <HeroCTA />
      <section id="beneficios">
        <BeneficiosZigZag />
      </section>
      <TimelineDetalhada />
      <section id="planos">
        <PlanosComparativo />
      </section>
      <FAQAccordion />
      <section id="cadastro">
        <FormularioInteresse />
      </section>
    </>
  )
}
