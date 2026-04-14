const usages = [
  { aluno: "Marina Costa", curso: "Excel Avançado", desconto: "R$ 26,70", data: "14/04/2026" },
  { aluno: "Pedro Almeida", curso: "Marketing Digital", desconto: "R$ 39,70", data: "13/04/2026" },
  { aluno: "Juliana Ramos", curso: "Design Gráfico", desconto: "R$ 34,70", data: "12/04/2026" },
  { aluno: "Rafael Lima", curso: "Power BI Completo", desconto: "R$ 49,70", data: "11/04/2026" },
  { aluno: "Carla Mendes", curso: "Inglês Profissional", desconto: "R$ 59,70", data: "10/04/2026" },
] as const

export function CouponUsageTable() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Aluno</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Curso</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Desconto</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {usages.map((u, i) => (
            <tr key={i}>
              <td className="px-4 py-2 text-sm text-[#1A1A2E]">{u.aluno}</td>
              <td className="px-4 py-2 text-sm text-gray-600">{u.curso}</td>
              <td className="px-4 py-2 font-mono text-sm font-semibold text-green-600">
                -{u.desconto}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">{u.data}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
