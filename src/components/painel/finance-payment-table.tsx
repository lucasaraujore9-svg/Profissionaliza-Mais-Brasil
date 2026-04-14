const payments = [
  { data: "14/04/2026", descricao: "Marina Costa · Excel Avançado", valor: "R$ 267,00", status: "Pago" },
  { data: "14/04/2026", descricao: "Pedro Almeida · Marketing Digital", valor: "R$ 397,00", status: "Pago" },
  { data: "13/04/2026", descricao: "Juliana Ramos · Design Gráfico", valor: "R$ 347,00", status: "Pendente" },
  { data: "13/04/2026", descricao: "Rafael Lima · Power BI Completo", valor: "R$ 497,00", status: "Pago" },
  { data: "13/04/2026", descricao: "Carla Mendes · Inglês Profissional", valor: "R$ 597,00", status: "Cancelado" },
  { data: "12/04/2026", descricao: "Bruno Souza · Gestão de Projetos", valor: "R$ 447,00", status: "Pago" },
  { data: "12/04/2026", descricao: "Fernanda Dias · Python Zero", valor: "R$ 597,00", status: "Pago" },
  { data: "12/04/2026", descricao: "Lucas Oliveira · Copywriting", valor: "R$ 297,00", status: "Pendente" },
  { data: "11/04/2026", descricao: "Amanda Reis · Maquiagem", valor: "R$ 397,00", status: "Pago" },
  { data: "11/04/2026", descricao: "Diego Martins · Oratória", valor: "R$ 247,00", status: "Pago" },
  { data: "10/04/2026", descricao: "Patrícia Alves · Excel Avançado", valor: "R$ 267,00", status: "Pago" },
  { data: "10/04/2026", descricao: "Tiago Ferreira · Marketing Digital", valor: "R$ 397,00", status: "Pago" },
  { data: "09/04/2026", descricao: "Vanessa Pires · Design Gráfico", valor: "R$ 347,00", status: "Cancelado" },
  { data: "09/04/2026", descricao: "Henrique Gomes · Power BI", valor: "R$ 497,00", status: "Pago" },
  { data: "08/04/2026", descricao: "Beatriz Cardoso · Inglês", valor: "R$ 597,00", status: "Pendente" },
] as const

const statusColors: Record<string, string> = {
  Pago: "bg-green-100 text-green-700",
  Pendente: "bg-yellow-100 text-yellow-700",
  Cancelado: "bg-red-100 text-red-700",
}

export function FinancePaymentTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Transações</h3>
        <span className="text-xs text-gray-500">
          Mostrando {payments.length} de 187
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {payments.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 font-mono text-sm text-gray-600">{p.data}</td>
                <td className="px-4 py-3 text-sm text-[#1A1A2E]">{p.descricao}</td>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-[#1A1A2E]">
                  {p.valor}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      statusColors[p.status]
                    }`}
                  >
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
