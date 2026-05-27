import { CreditCard, Landmark, QrCode, ShieldCheck, Lock } from "lucide-react"

const metodos = [
  {
    id: "pix",
    label: "PIX",
    hint: "Aprovação imediata",
    icon: QrCode,
  },
  {
    id: "credito",
    label: "Cartão de Crédito",
    hint: "Parcele em até 12x",
    icon: CreditCard,
  },
  {
    id: "boleto",
    label: "Boleto bancário",
    hint: "Vence em até 3 dias",
    icon: Landmark,
  },
]

export function PaymentInfo() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
          02
        </div>
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Como você vai pagar
        </h2>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Após clicar em <strong className="font-semibold text-[var(--color-pmb-green-900)]">Finalizar compra</strong>,
        você será levado para uma tela segura para escolher como pagar:
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {metodos.map((m) => {
          const Icon = m.icon
          return (
            <li
              key={m.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-[var(--color-pmb-mist)]/40 p-4"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--color-pmb-green)] shadow-sm">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {m.label}
                </div>
                <div className="text-xs text-gray-500">{m.hint}</div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Seu pagamento é processado pelo <strong className="font-semibold">Mercado Pago</strong>,
          com criptografia ponta a ponta. Não armazenamos dados de cartão.
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
        <Lock className="h-3 w-3" />
        Conexão segura via HTTPS
      </div>
    </div>
  )
}
