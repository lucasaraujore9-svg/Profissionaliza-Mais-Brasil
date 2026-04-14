import { AlertTriangle } from "lucide-react"

const OVERDUES = [
  { id: "o1", revendedor: "Instituto Avance", dias: 18, valor: "R$ 297,00" },
  { id: "o2", revendedor: "Curso Express", dias: 12, valor: "R$ 197,00" },
  { id: "o3", revendedor: "Educa+ Cursos", dias: 3, valor: "R$ 297,00" },
  { id: "o4", revendedor: "Centro Profissional SP", dias: 2, valor: "R$ 297,00" },
  { id: "o5", revendedor: "Click Carreira", dias: 1, valor: "R$ 197,00" },
]

export function AdminOverdueSection() {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm">
      <div className="flex items-center justify-between border-b border-rose-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-rose-900">Inadimplência</h3>
            <p className="mt-0.5 text-xs text-rose-800/80">
              5 assinaturas em atraso somando R$ 1.285,00.
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rose-100 text-left text-xs uppercase tracking-wide text-rose-700/80">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">Dias de atraso</th>
              <th className="px-6 py-3 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {OVERDUES.map((o) => (
              <tr key={o.id} className="border-b border-rose-100 last:border-b-0">
                <td className="px-6 py-3 font-medium text-[#1A1A2E]">{o.revendedor}</td>
                <td className="px-6 py-3 font-mono text-rose-700">{o.dias} dias</td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">{o.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
