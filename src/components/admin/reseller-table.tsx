import Link from "next/link"
import { Eye, Pencil, Pause } from "lucide-react"

const RESELLERS = [
  { id: "r-001", nome: "Educa+ Cursos", email: "joao@educamais.com.br", mrr: "R$ 14.820", alunos: 1284, status: "ativo" },
  { id: "r-002", nome: "Academia Digital BR", email: "contato@academiadigital.br", mrr: "R$ 12.110", alunos: 982, status: "ativo" },
  { id: "r-003", nome: "Formação Pro", email: "admin@formacaopro.com.br", mrr: "R$ 9.640", alunos: 874, status: "ativo" },
  { id: "r-004", nome: "EduTech Norte", email: "rh@edutechnorte.com", mrr: "R$ 8.930", alunos: 712, status: "ativo" },
  { id: "r-005", nome: "Centro Profissional SP", email: "central@centroprofsp.com.br", mrr: "R$ 7.480", alunos: 654, status: "pendente" },
  { id: "r-006", nome: "Carreira Rápida", email: "ola@carreirarapida.com.br", mrr: "R$ 6.220", alunos: 589, status: "ativo" },
  { id: "r-007", nome: "Saber Online", email: "contato@saberonline.app", mrr: "R$ 5.870", alunos: 512, status: "ativo" },
  { id: "r-008", nome: "Instituto Avance", email: "diretoria@avance.edu.br", mrr: "R$ 5.330", alunos: 488, status: "suspenso" },
  { id: "r-009", nome: "Vertical Skills", email: "team@verticalskills.com", mrr: "R$ 4.910", alunos: 421, status: "ativo" },
  { id: "r-010", nome: "Nova Trilha EAD", email: "novatrilha@ead.br", mrr: "R$ 4.580", alunos: 396, status: "ativo" },
  { id: "r-011", nome: "Profissionaliza Sul", email: "sul@profissionaliza.com.br", mrr: "R$ 4.220", alunos: 358, status: "ativo" },
  { id: "r-012", nome: "Click Carreira", email: "click@clickcarreira.com", mrr: "R$ 3.940", alunos: 312, status: "pendente" },
  { id: "r-013", nome: "EAD Brasil Hub", email: "atende@eadbrasil.hub", mrr: "R$ 3.610", alunos: 289, status: "ativo" },
  { id: "r-014", nome: "Cursos Mil Grau", email: "joao@milgrau.com.br", mrr: "R$ 3.480", alunos: 274, status: "ativo" },
  { id: "r-015", nome: "Foco Total Educa", email: "foco@focototal.com", mrr: "R$ 3.220", alunos: 248, status: "ativo" },
  { id: "r-016", nome: "Plataforma Saber+", email: "saber@plataformasaber.io", mrr: "R$ 2.980", alunos: 224, status: "ativo" },
  { id: "r-017", nome: "Aprende Aí", email: "ola@aprendeai.com.br", mrr: "R$ 2.760", alunos: 198, status: "ativo" },
  { id: "r-018", nome: "Curso Express", email: "express@cursoexpress.io", mrr: "R$ 2.540", alunos: 184, status: "suspenso" },
  { id: "r-019", nome: "Cidadão Profissional", email: "diretoria@cidadaopro.org", mrr: "R$ 2.310", alunos: 166, status: "ativo" },
  { id: "r-020", nome: "Norte Capacita", email: "norte@nortecapacita.org", mrr: "R$ 2.080", alunos: 152, status: "ativo" },
] as const

const STATUS_STYLES: Record<(typeof RESELLERS)[number]["status"], string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  suspenso: "bg-rose-100 text-rose-700",
}

export function ResellerTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">MRR</th>
              <th className="px-6 py-3 font-medium">Alunos</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {RESELLERS.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-6 py-3">
                  <p className="font-semibold text-[#1A1A2E]">{r.nome}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{r.email}</p>
                </td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">{r.mrr}</td>
                <td className="px-6 py-3 font-mono text-gray-700">{r.alunos}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/revendedores/${r.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Ver"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-[#1A1A2E]"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Suspender"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
