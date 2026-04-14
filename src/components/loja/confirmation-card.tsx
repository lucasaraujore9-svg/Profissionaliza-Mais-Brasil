interface ConfirmationCardProps {
  numeroPedido: string
  curso: string
  total: string
  email: string
}

export function ConfirmationCard({
  numeroPedido,
  curso,
  total,
  email,
}: ConfirmationCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Número do pedido
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-[#1A1A2E]">
            {numeroPedido}
          </div>
        </div>
        <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Pagamento aprovado
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Curso</dt>
          <dd className="font-medium text-[#1A1A2E]">{curso}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">Email de acesso</dt>
          <dd className="font-mono text-[#1A1A2E]">{email}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <dt className="text-sm font-medium text-[#1A1A2E]">Valor pago</dt>
          <dd className="font-mono text-lg font-bold text-[#1A1A2E]">{total}</dd>
        </div>
      </dl>
    </div>
  )
}
