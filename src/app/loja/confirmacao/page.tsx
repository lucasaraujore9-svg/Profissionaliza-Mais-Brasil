import Link from "next/link"
import { ExternalLink, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SuccessIcon } from "@/components/loja/success-icon"
import { ConfirmationCard } from "@/components/loja/confirmation-card"
import { NextSteps } from "@/components/loja/next-steps"

export default function ConfirmacaoPage() {
  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="text-center">
          <SuccessIcon />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-[#1A1A2E] md:text-3xl">
            Matrícula realizada com sucesso!
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 md:text-base">
            Obrigado pela confiança. Você já pode começar a estudar agora mesmo.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <ConfirmationCard
            numeroPedido="PMB-2026-04-00182"
            curso="Excel Avançado — Do Zero ao PROCV"
            total="R$ 267,30"
            email="aluno@email.com"
          />

          <NextSteps />

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ir para Escola Avançada
            </Button>
            <Link href="/loja">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Home className="mr-2 h-4 w-4" />
                Voltar à loja
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
