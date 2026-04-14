import { HeroSection } from "@/components/main/hero-section"
import { ComoFunciona } from "@/components/main/como-funciona"
import { NumerosBento } from "@/components/main/numeros-bento"
import { CatalogoPreview } from "@/components/main/catalogo-preview"
import { PlanosSection } from "@/components/main/planos-section"
import { DepoimentosSection } from "@/components/main/depoimentos-section"

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <ComoFunciona />
      <NumerosBento />
      <CatalogoPreview />
      <PlanosSection />
      <DepoimentosSection />
    </>
  )
}
