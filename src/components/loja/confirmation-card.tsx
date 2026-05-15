type EnrollmentStatusLabel =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED"
  | "COMPLETED"

interface ConfirmationCardProps {
  numeroPedido: string
  curso: string
  total: string
  email: string
  status: EnrollmentStatusLabel
}

const STATUS_CONFIG: Record<
  EnrollmentStatusLabel,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pagamento em análise",
    className: "bg-yellow-100 text-yellow-700",
  },
  ACTIVE: {
    label: "Aprovada",
    className: "bg-green-100 text-green-700",
  },
  SUSPENDED: {
    label: "Suspensa",
    className: "bg-orange-100 text-orange-700",
  },
  CANCELLED: {
    label: "Cancelada",
    className: "bg-red-100 text-red-700",
  },
  COMPLETED: {
    label: "Concluída",
    className: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-700)]",
  },
}

export function ConfirmationCard({
  numeroPedido,
  curso,
  total,
  email,
  status,
}: ConfirmationCardProps) {
  const config = STATUS_CONFIG[status]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Número do pedido
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">
            {numeroPedido}
          </div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs font-semibold ${config.className}`}
        >
          {config.label}
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Curso</dt>
          <dd className="text-right font-medium text-[var(--color-pmb-green-900)]">{curso}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Email de acesso</dt>
          <dd className="font-mono text-[var(--color-pmb-green-900)]">{email}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <dt className="text-sm font-medium text-[var(--color-pmb-green-900)]">Valor pago</dt>
          <dd className="font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">{total}</dd>
        </div>
      </dl>
    </div>
  )
}
