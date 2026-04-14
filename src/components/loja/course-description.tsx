import { CheckCircle2 } from "lucide-react"

interface CourseDescriptionProps {
  descricao: string | null
  highlights?: string[]
}

const DEFAULT_HIGHLIGHTS = [
  "Aulas online com acesso imediato",
  "Certificado ao concluir o curso",
  "Material didático completo",
  "Suporte durante o curso",
]

export function CourseDescription({ descricao, highlights }: CourseDescriptionProps) {
  const items = highlights && highlights.length > 0 ? highlights : DEFAULT_HIGHLIGHTS

  const paragraphs =
    descricao && descricao.trim().length > 0
      ? descricao.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      : ["Curso profissionalizante com conteúdo completo e prático."]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
        Sobre este curso
      </h2>

      <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-700">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 lg:p-8">
        <h3 className="text-lg font-semibold text-[#1A1A2E]">O que você vai aprender</h3>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
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
