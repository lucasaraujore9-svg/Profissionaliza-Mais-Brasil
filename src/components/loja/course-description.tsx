import { CheckCircle2 } from "lucide-react"

const aprenda = [
  "Fórmulas avançadas (PROCV, ÍNDICE, CORRESP, SOMASE)",
  "Tabelas dinâmicas e dashboards executivos",
  "Macros e VBA para automatizar planilhas",
  "Power Query para tratar dados em massa",
  "Boas práticas de organização e proteção",
  "Casos reais de mercado resolvidos passo a passo",
]

export function CourseDescription() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
        Sobre este curso
      </h2>

      <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-700">
        <p>
          Este curso foi desenhado pra quem quer dominar o Excel em profundidade e
          se diferenciar no mercado de trabalho. Começamos do básico revisado e
          avançamos até recursos que poucos profissionais conhecem.
        </p>
        <p>
          Com mais de 120 horas de conteúdo, 40 aulas divididas em 5 módulos e
          exercícios práticos baseados em casos reais, você vai sair apto a
          trabalhar em qualquer empresa que use Excel no dia a dia.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 lg:p-8">
        <h3 className="text-lg font-semibold text-[#1A1A2E]">O que você vai aprender</h3>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {aprenda.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
