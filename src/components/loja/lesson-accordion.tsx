"use client"

import { useState } from "react"
import { ChevronDown, PlayCircle, Lock } from "lucide-react"

export interface LessonAccordionAula {
  titulo: string
  duracao?: string
  preview?: boolean
}

export interface LessonAccordionModulo {
  numero: number
  titulo: string
  duracao?: string
  aulas: LessonAccordionAula[]
}

interface LessonAccordionProps {
  modulos: LessonAccordionModulo[]
  totalHoras?: string
}

export function LessonAccordion({ modulos, totalHoras }: LessonAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const totalAulas = modulos.reduce((sum, m) => sum + m.aulas.length, 0)

  if (modulos.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
          Conteúdo do curso
        </h2>
        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          O conteúdo deste curso ainda está sendo preparado.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <h2 className="text-2xl font-bold text-[#1A1A2E] md:text-3xl">
          Conteúdo do curso
        </h2>
        <p className="text-sm text-gray-500">
          {modulos.length} {modulos.length === 1 ? "módulo" : "módulos"} ·{" "}
          {totalAulas} {totalAulas === 1 ? "aula" : "aulas"}
          {totalHoras ? ` · ${totalHoras} no total` : ""}
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {modulos.map((modulo, index) => {
          const isOpen = openIndex === index
          return (
            <div
              key={`${modulo.numero}-${modulo.titulo}`}
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
                      {modulo.aulas.length} {modulo.aulas.length === 1 ? "aula" : "aulas"}
                      {modulo.duracao ? ` · ${modulo.duracao}` : ""}
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
                  {modulo.aulas.map((aula, aulaIdx) => (
                    <li
                      key={`${aula.titulo}-${aulaIdx}`}
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
                      {aula.duracao && (
                        <span className="font-mono text-xs text-gray-500">
                          {aula.duracao}
                        </span>
                      )}
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
