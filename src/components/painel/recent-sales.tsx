const sales = [
  {
    nome: "Marina Costa",
    curso: "Excel Avançado",
    valor: "R$ 267,00",
    data: "Há 12 min",
    status: "aprovado",
  },
  {
    nome: "Pedro Almeida",
    curso: "Marketing Digital",
    valor: "R$ 397,00",
    data: "Há 1h",
    status: "aprovado",
  },
  {
    nome: "Juliana Ramos",
    curso: "Design Gráfico",
    valor: "R$ 347,00",
    data: "Há 3h",
    status: "pendente",
  },
  {
    nome: "Rafael Lima",
    curso: "Power BI Completo",
    valor: "R$ 497,00",
    data: "Há 5h",
    status: "aprovado",
  },
  {
    nome: "Carla Mendes",
    curso: "Inglês Profissional",
    valor: "R$ 597,00",
    data: "Ontem",
    status: "cancelado",
  },
] as const

const statusColors: Record<string, string> = {
  aprovado: "bg-green-100 text-green-700",
  pendente: "bg-yellow-100 text-yellow-700",
  cancelado: "bg-red-100 text-red-700",
}

export function RecentSales() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">
          Vendas recentes
        </h3>
        <a
          href="/painel/financeiro"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Ver todas →
        </a>
      </div>

      <ul className="mt-4 divide-y divide-gray-100">
        {sales.map((sale, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {sale.nome
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[#1A1A2E]">
                  {sale.nome}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {sale.curso} · {sale.data}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-[#1A1A2E]">
                {sale.valor}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                  statusColors[sale.status]
                }`}
              >
                {sale.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
