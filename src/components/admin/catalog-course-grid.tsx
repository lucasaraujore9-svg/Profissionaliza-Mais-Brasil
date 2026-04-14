import { BookOpen, Users } from "lucide-react"

const COURSES = [
  { id: "c01", nome: "Auxiliar Administrativo", revendedores: 28, alunos: 1284, preco: "R$ 127" },
  { id: "c02", nome: "Assistente Contábil", revendedores: 22, alunos: 984, preco: "R$ 147" },
  { id: "c03", nome: "Atendimento ao Cliente", revendedores: 34, alunos: 1420, preco: "R$ 97" },
  { id: "c04", nome: "Marketing Digital Básico", revendedores: 19, alunos: 742, preco: "R$ 167" },
  { id: "c05", nome: "Vendas Externas", revendedores: 14, alunos: 556, preco: "R$ 127" },
  { id: "c06", nome: "Recursos Humanos", revendedores: 21, alunos: 878, preco: "R$ 147" },
  { id: "c07", nome: "Logística e Estoque", revendedores: 16, alunos: 612, preco: "R$ 147" },
  { id: "c08", nome: "Secretariado", revendedores: 18, alunos: 694, preco: "R$ 117" },
  { id: "c09", nome: "Informática Básica", revendedores: 30, alunos: 1312, preco: "R$ 87" },
  { id: "c10", nome: "Pacote Office Avançado", revendedores: 17, alunos: 648, preco: "R$ 157" },
  { id: "c11", nome: "Excel do Zero ao Avançado", revendedores: 25, alunos: 1012, preco: "R$ 127" },
  { id: "c12", nome: "Auxiliar de Farmácia", revendedores: 12, alunos: 418, preco: "R$ 197" },
  { id: "c13", nome: "Cuidador de Idosos", revendedores: 15, alunos: 522, preco: "R$ 167" },
  { id: "c14", nome: "Maquiagem Profissional", revendedores: 9, alunos: 312, preco: "R$ 177" },
  { id: "c15", nome: "Design Gráfico Intro", revendedores: 11, alunos: 398, preco: "R$ 157" },
  { id: "c16", nome: "Pedagogia Empresarial", revendedores: 8, alunos: 284, preco: "R$ 187" },
  { id: "c17", nome: "Psicologia Organizacional", revendedores: 10, alunos: 362, preco: "R$ 197" },
  { id: "c18", nome: "Libras Básico", revendedores: 13, alunos: 472, preco: "R$ 127" },
  { id: "c19", nome: "Eletricista Predial", revendedores: 7, alunos: 248, preco: "R$ 217" },
  { id: "c20", nome: "Empreendedorismo", revendedores: 20, alunos: 812, preco: "R$ 137" },
]

export function CatalogCourseGrid() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">
          {COURSES.length} cursos no catálogo
        </h3>
        <span className="text-xs text-gray-500">Agregado de todos os revendedores</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {COURSES.map((c) => (
          <article
            key={c.id}
            className="group rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition-all hover:border-blue-300 hover:shadow-sm"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <BookOpen className="h-4 w-4" />
            </span>
            <h4 className="mt-3 text-sm font-semibold leading-snug text-[#1A1A2E]">
              {c.nome}
            </h4>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {c.alunos} alunos
              </span>
              <span className="font-mono font-semibold text-[#1A1A2E]">{c.preco}</span>
            </div>
            <p className="mt-2 text-[10px] font-medium text-gray-500">
              {c.revendedores} revendedores vendendo
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
