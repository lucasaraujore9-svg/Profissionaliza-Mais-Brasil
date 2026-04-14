import Link from "next/link"
import { CheckCircle2, Mail, Rocket, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CheckoutConfirmacaoResult {
  slug: string
  email: string
  paymentUrl: string | null
}

interface CheckoutConfirmacaoProps {
  result: CheckoutConfirmacaoResult | null
  email: string
}

const nextSteps = [
  {
    icon: Mail,
    title: "Finalize o pagamento",
    description:
      "Abra a fatura Asaas e conclua a primeira cobrança para ativar seu acesso.",
  },
  {
    icon: Rocket,
    title: "Acesse seu painel",
    description:
      "Após confirmação, você receberá o email com instruções de login e onboarding.",
  },
] as const

export function CheckoutConfirmacao({
  result,
  email,
}: CheckoutConfirmacaoProps) {
  const displayEmail = result?.email ?? email

  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>

      <h2 className="mt-5 text-xl font-bold text-[#1A1A2E] md:text-2xl">
        Cadastro recebido!
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        Enviamos os detalhes para <span className="font-semibold">{displayEmail}</span>.
        Conclua o pagamento para ativar sua conta.
      </p>

      <div className="mt-8 space-y-3 text-left">
        {nextSteps.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.title}
              className="flex gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#1A1A2E]">
                  {step.title}
                </div>
                <p className="mt-1 text-sm text-gray-600">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {result?.paymentUrl && (
          <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer">
            <Button
              size="lg"
              className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir fatura
            </Button>
          </a>
        )}
        <Link href="/login">
          <Button size="lg" variant="outline" className="w-full sm:w-auto">
            Acessar painel
          </Button>
        </Link>
      </div>
    </div>
  )
}
