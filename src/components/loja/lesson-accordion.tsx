"use client"

import { useState } from "react"
import { ChevronDown, PlayCircle, Lock } from "lucide-react"

interface Aula {
  titulo: string
  duracao: string
  preview?: boolean
}

interface Modulo {
  numero: number
  titulo: string
  duracao: string
  aulas: Aula[]
}

const modulos: Modulo[] = [
  {
    numero: 1,
    titulo: "Introdução e fundamentos",
    duracao: "4h 20min",
    aulas: [
      { titulo: "Boas-vindas e visão geral do curso", duracao: "12:30", preview: true },
      { titulo: "Configurando o ambiente de trabalho", duracao: "18:45" },
      { titulo: "Interface do Excel em detalhes", duracao: "25:10" },
    ],
  },
  {
    numero: 2,
    titulo: "Fórmulas e funções essenciais",
    duracao: "8h 15min",
    aulas: [
      { titulo: "PROCV — o que é e quando usar", duracao: "22:00" },
      { titulo: "ÍNDICE e CORRESP — a dupla poderosa", duracao: "28:30" },
      { titulo: "SOMASE, CONT.SE e MÉDIA.SE", duracao: "19:50" },
    ],
  },
  {
    numero: 3,
    titulo: "Tabelas dinâmicas e dashboards",
    duracao: "6h 40min",
    aulas: [
      { titulo: "Criando sua primeira tabela dinâmica", duracao: "24:15" },
      { titulo: "Gráficos dinâmicos e segmentação", duracao: "30:20" },
      { titulo: "Dashboards executivos na prática", duracao: "35:10" },
    ],
  },
  {
    numero: 4,
    titulo: "Macros e VBA",
    duracao: "12h 30min",
    aulas: [
      { titulo: "O que é VBA e como usar", duracao: "20:00" },
      { titulo: "Gravando sua primeira macro", duracao: "18:30" },
      { titulo: "Automatizando relatórios completos", duracao: "45:20" },
    ],
  },
  {
    numero: 5,
    titulo: "Projeto final e certificação",
    duracao: "5h 00min",
    aulas: [
      { titulo: "Briefing do projeto final", duracao: "15:00" },
      { titulo: "Desenvolvendo o projeto — passo a passo", duracao: "90:00" },
      { titulo: "Como obter seu certificado", duracao: "8:30" },
    ],
  },
]

export function LessonAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const totalAulas = modulos.reduce((sum, m) => sum + m.aulas.length, 0)

  return (
    <div>
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
          Conteúdo do curso
        </h2>
        <p className="text-sm text-gray-500">
          {modulos.length} módulos · {totalAulas} aulas · 120h no total
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {modulos.map((modulo, index) => {
          const isOpen = openIndex === index
          return (
            <div
              key={modulo.numero}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-gray-50"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-mono text-sm font-semibold text-blue-600">
                    {String(modulo.numero).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[#1A1A2E]">
                      {modulo.titulo}
                    </div>
                    <div className="text-xs text-gray-500">
                      {modulo.aulas.length} aulas · {modulo.duracao}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/30">
                  {modulo.aulas.map((aula) => (
                    <li
                      key={aula.titulo}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        {aula.preview ? (
                          <PlayCircle className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        <span>{aula.titulo}</span>
                        {aula.preview && (
                          <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            GRÁTIS
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-gray-500">
                        {aula.duracao}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
