import { CheckCircle2, Mail, Rocket } from "lucide-react"

const nextSteps = [
  {
    icon: Mail,
    title: "Verifique seu email",
    description: "Enviamos a confirmação e os próximos passos para o email cadastrado.",
  },
  {
    icon: Rocket,
    title: "Configure sua vitrine",
    description: "Acesse o painel e defina nome, cores e domínio da sua loja.",
  },
] as const

export function CheckoutConfirmacao() {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>

      <h2 className="mt-5 text-xl font-bold text-[#1A1A2E] md:text-2xl">
        Cadastro concluído com sucesso!
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        Bem-vindo à Profissionaliza Mais Brasil. Sua conta de revendedor já está
        ativa.
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
    </div>
  )
}
