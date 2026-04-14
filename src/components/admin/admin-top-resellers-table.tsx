import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

const RESELLERS = [
  { id: "r-001", nome: "Educa+ Cursos", mrr: "R$ 14.820", alunos: 1284, status: "ativo" as const },
  { id: "r-002", nome: "Academia Digital BR", mrr: "R$ 12.110", alunos: 982, status: "ativo" as const },
  { id: "r-003", nome: "Formação Pro", mrr: "R$ 9.640", alunos: 874, status: "ativo" as const },
  { id: "r-004", nome: "EduTech Norte", mrr: "R$ 8.930", alunos: 712, status: "ativo" as const },
  { id: "r-005", nome: "Centro Profissional SP", mrr: "R$ 7.480", alunos: 654, status: "pendente" as const },
  { id: "r-006", nome: "Carreira Rápida", mrr: "R$ 6.220", alunos: 589, status: "ativo" as const },
  { id: "r-007", nome: "Saber Online", mrr: "R$ 5.870", alunos: 512, status: "ativo" as const },
  { id: "r-008", nome: "Instituto Avance", mrr: "R$ 5.330", alunos: 488, status: "suspenso" as const },
  { id: "r-009", nome: "Vertical Skills", mrr: "R$ 4.910", alunos: 421, status: "ativo" as const },
  { id: "r-010", nome: "Nova Trilha EAD", mrr: "R$ 4.580", alunos: 396, status: "ativo" as const },
]

const STATUS_STYLES = {
  ativo: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  suspenso: "bg-rose-100 text-rose-700",
}

export function AdminTopResellersTable() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Top revendedores</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Rankeados por MRR dos últimos 30 dias.
          </p>
        </div>
        <Link
          href="/admin/revendedores"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Ver todos
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">MRR</th>
              <th className="px-6 py-3 font-medium">Alunos</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {RESELLERS.map((r, idx) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-400">{String(idx + 1).padStart(2, "0")}</span>
                    <span className="font-medium text-[#1A1A2E]">{r.nome}</span>
                  </div>
                </td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">{r.mrr}</td>
                <td className="px-6 py-3 font-mono text-gray-700">{r.alunos}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <Link
                    href={`/admin/revendedores/${r.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Ver
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
