const PAYMENTS = [
  { id: "p01", revendedor: "Educa+ Cursos", valor: "R$ 297,00", data: "08/04/2026", status: "pago" },
  { id: "p02", revendedor: "Academia Digital BR", valor: "R$ 297,00", data: "07/04/2026", status: "pago" },
  { id: "p03", revendedor: "Formação Pro", valor: "R$ 197,00", data: "07/04/2026", status: "pago" },
  { id: "p04", revendedor: "EduTech Norte", valor: "R$ 297,00", data: "06/04/2026", status: "pago" },
  { id: "p05", revendedor: "Centro Profissional SP", valor: "R$ 297,00", data: "06/04/2026", status: "pendente" },
  { id: "p06", revendedor: "Carreira Rápida", valor: "R$ 197,00", data: "05/04/2026", status: "pago" },
  { id: "p07", revendedor: "Saber Online", valor: "R$ 197,00", data: "05/04/2026", status: "pago" },
  { id: "p08", revendedor: "Instituto Avance", valor: "R$ 297,00", data: "05/04/2026", status: "cancelado" },
  { id: "p09", revendedor: "Vertical Skills", valor: "R$ 197,00", data: "04/04/2026", status: "pago" },
  { id: "p10", revendedor: "Nova Trilha EAD", valor: "R$ 197,00", data: "04/04/2026", status: "pago" },
  { id: "p11", revendedor: "Profissionaliza Sul", valor: "R$ 297,00", data: "03/04/2026", status: "pago" },
  { id: "p12", revendedor: "Click Carreira", valor: "R$ 197,00", data: "03/04/2026", status: "pendente" },
  { id: "p13", revendedor: "EAD Brasil Hub", valor: "R$ 197,00", data: "02/04/2026", status: "pago" },
  { id: "p14", revendedor: "Cursos Mil Grau", valor: "R$ 197,00", data: "02/04/2026", status: "pago" },
  { id: "p15", revendedor: "Foco Total Educa", valor: "R$ 197,00", data: "01/04/2026", status: "pago" },
]

const STATUS_STYLES: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  cancelado: "bg-rose-100 text-rose-700",
}

export function AdminPaymentList() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Pagamentos recentes</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Últimas cobranças geradas via Asaas para assinaturas de revendedores.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">Valor</th>
              <th className="px-6 py-3 font-medium">Data</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-[#1A1A2E]">{p.revendedor}</td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">{p.valor}</td>
                <td className="px-6 py-3 font-mono text-xs text-gray-600">{p.data}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status]}`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
