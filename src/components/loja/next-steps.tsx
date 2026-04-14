import { Mail, LogIn, BookOpen } from "lucide-react"

const steps = [
  {
    icon: Mail,
    title: "Verifique seu email",
    description: "Enviamos suas credenciais de acesso para o email cadastrado.",
  },
  {
    icon: LogIn,
    title: "Acesse a Escola Avançada",
    description: "Faça login em escolaavancada.com.br com os dados recebidos.",
  },
  {
    icon: BookOpen,
    title: "Comece a estudar",
    description: "Seu curso já está liberado. Assista quando e onde quiser.",
  },
]

export function NextSteps() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h2 className="text-base font-semibold text-[#1A1A2E]">Próximos passos</h2>
      <p className="mt-1 text-sm text-gray-600">
        Você será redirecionado à Escola Avançada onde seus estudos acontecem.
      </p>

      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <step.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-600">
                  0{index + 1}
                </span>
                <span className="text-sm font-semibold text-[#1A1A2E]">
                  {step.title}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
