import { Check } from "lucide-react"

export const CHECKOUT_STEPS = [
  { id: 1, label: "Dados pessoais" },
  { id: 2, label: "Empresa" },
  { id: 3, label: "Pagamento" },
  { id: 4, label: "Confirmação" },
] as const

interface CheckoutProgressProps {
  currentStep: number
}

export function CheckoutProgress({ currentStep }: CheckoutProgressProps) {
  const progress = ((currentStep - 1) / (CHECKOUT_STEPS.length - 1)) * 100

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium text-[var(--color-pmb-green-900)]">
          Etapa {currentStep} de {CHECKOUT_STEPS.length}
        </span>
        <span className="font-mono">{Math.round(progress)}%</span>
      </div>

      <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-pmb-green)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-6 hidden grid-cols-4 gap-3 md:grid">
        {CHECKOUT_STEPS.map((step) => {
          const isDone = step.id < currentStep
          const isActive = step.id === currentStep
          return (
            <li key={step.id} className="flex flex-col items-center gap-2 text-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-all ${
                  isDone
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                    : isActive
                      ? "border-[var(--color-pmb-green)] bg-white text-[var(--color-pmb-green)] shadow-md shadow-[rgba(2,89,24,0.35)]/20"
                      : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : step.id}
              </div>
              <span
                className={`text-xs font-medium leading-tight ${
                  isActive ? "text-[var(--color-pmb-green-900)]" : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 md:hidden">
        <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {CHECKOUT_STEPS[currentStep - 1]?.label}
        </span>
      </div>
    </div>
  )
}
