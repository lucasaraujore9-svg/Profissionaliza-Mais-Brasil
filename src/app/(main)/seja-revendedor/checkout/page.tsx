import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { CheckoutWizard } from "@/components/main/checkout-wizard"
import { CheckoutResumoPlano } from "@/components/main/checkout-resumo-plano"

export default function CheckoutRevendedorPage() {
  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-6">
          <Link
            href="/seja-revendedor"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-[#1A1A2E]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para planos
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
            Finalize sua assinatura
          </h1>
          <p className="mt-2 text-sm text-gray-600 md:text-base">
            Em poucos minutos você terá sua vitrine pronta para vender.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <CheckoutWizard />
          <CheckoutResumoPlano />
        </div>
      </div>
    </section>
  )
}
