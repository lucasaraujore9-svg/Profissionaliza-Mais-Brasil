import { Clock, Layers, Users, Award } from "lucide-react"

const stats = [
  { icon: Clock, label: "Horas de conteúdo", value: "120h" },
  { icon: Layers, label: "Módulos", value: "5" },
  { icon: Users, label: "Alunos matriculados", value: "12.4k" },
  { icon: Award, label: "Certificado", value: "Incluso" },
]

export function CourseStats() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-gray-200 bg-white p-5 text-center"
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <stat.icon className="h-5 w-5" />
          </div>
          <div className="mt-3 font-mono text-xl font-bold text-[#1A1A2E]">
            {stat.value}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
