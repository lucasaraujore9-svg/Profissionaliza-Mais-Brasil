import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  studentPaymentTarget,
  type PayableEnrollment,
} from "@/lib/students/student-payment-link"

const DEFAULT_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"

interface PayPendingButtonProps {
  enrollment: PayableEnrollment
  className?: string
  /**
   * Rota usada quando nao ha checkout reabrivel (ex.: PMB via MP sem link
   * persistido). Sem fallback, o botao nao renderiza — util nas telas onde ja
   * existe o botao "Ja fiz o pagamento" ao lado.
   */
  fallbackHref?: string
}

/**
 * Botao "Pagar agora" para uma cobranca PENDENTE na area do aluno. Resolve o
 * destino via {@link studentPaymentTarget}: fatura Asaas (nova aba) ou checkout
 * transparente in-app (mesma aba, sessao preservada). Substitui a regra antiga
 * que so mostrava o botao quando havia `asaasInvoiceUrl`.
 */
export function PayPendingButton({
  enrollment,
  className,
  fallbackHref,
}: PayPendingButtonProps) {
  const target = studentPaymentTarget(enrollment)
  const cls = className ?? DEFAULT_CLASS

  if (!target) {
    if (!fallbackHref) return null
    return (
      <Link href={fallbackHref} className={cls}>
        Pagar agora
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  if (target.external) {
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        Pagar agora
        <ArrowRight className="h-4 w-4" />
      </a>
    )
  }

  return (
    <Link href={target.href} className={cls}>
      Pagar agora
      <ArrowRight className="h-4 w-4" />
    </Link>
  )
}
