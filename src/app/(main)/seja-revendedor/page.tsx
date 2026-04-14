import { HeroCTA } from "@/components/main/hero-cta"
import { BeneficiosZigZag } from "@/components/main/beneficios-zigzag"
import { TimelineDetalhada } from "@/components/main/timeline-detalhada"
import { PlanosComparativo } from "@/components/main/planos-comparativo"
import { FAQAccordion } from "@/components/main/faq-accordion"
import { FormularioInteresse } from "@/components/main/formulario-interesse"

export default function SejaRevendedorPage() {
  return (
    <>
      <HeroCTA />
      <BeneficiosZigZag />
      <TimelineDetalhada />
      <PlanosComparativo />
      <FAQAccordion />
      <FormularioInteresse />
    </>
  )
}
