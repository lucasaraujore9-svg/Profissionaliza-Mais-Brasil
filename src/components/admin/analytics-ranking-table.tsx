"use client"

import { useState } from "react"

const METRICS = ["MRR", "Alunos", "Conversão", "Churn"] as const

const RANKINGS: Record<(typeof METRICS)[number], { nome: string; valor: string }[]> = {
  MRR: [
    { nome: "Educa+ Cursos", valor: "R$ 14.820" },
    { nome: "Academia Digital BR", valor: "R$ 12.110" },
    { nome: "Formação Pro", valor: "R$ 9.640" },
    { nome: "EduTech Norte", valor: "R$ 8.930" },
    { nome: "Centro Profissional SP", valor: "R$ 7.480" },
    { nome: "Carreira Rápida", valor: "R$ 6.220" },
    { nome: "Saber Online", valor: "R$ 5.870" },
    { nome: "Instituto Avance", valor: "R$ 5.330" },
    { nome: "Vertical Skills", valor: "R$ 4.910" },
    { nome: "Nova Trilha EAD", valor: "R$ 4.580" },
  ],
  Alunos: [
    { nome: "Educa+ Cursos", valor: "1.284" },
    { nome: "Academia Digital BR", valor: "982" },
    { nome: "Formação Pro", valor: "874" },
    { nome: "EduTech Norte", valor: "712" },
    { nome: "Centro Profissional SP", valor: "654" },
    { nome: "Carreira Rápida", valor: "589" },
    { nome: "Saber Online", valor: "512" },
    { nome: "Instituto Avance", valor: "488" },
    { nome: "Vertical Skills", valor: "421" },
    { nome: "Nova Trilha EAD", valor: "396" },
  ],
  Conversão: [
    { nome: "Saber Online", valor: "12,4%" },
    { nome: "Educa+ Cursos", valor: "10,8%" },
    { nome: "Vertical Skills", valor: "9,7%" },
    { nome: "Formação Pro", valor: "9,2%" },
    { nome: "Academia Digital BR", valor: "8,9%" },
    { nome: "Nova Trilha EAD", valor: "8,1%" },
    { nome: "EduTech Norte", valor: "7,6%" },
    { nome: "Click Carreira", valor: "7,3%" },
    { nome: "Carreira Rápida", valor: "6,9%" },
    { nome: "Centro Profissional SP", valor: "6,4%" },
  ],
  Churn: [
    { nome: "Cursos Mil Grau", valor: "0,8%" },
    { nome: "Saber Online", valor: "1,1%" },
    { nome: "Educa+ Cursos", valor: "1,4%" },
    { nome: "Formação Pro", valor: "1,6%" },
    { nome: "Academia Digital BR", valor: "1,8%" },
    { nome: "EduTech Norte", valor: "2,0%" },
    { nome: "Vertical Skills", valor: "2,2%" },
    { nome: "Nova Trilha EAD", valor: "2,4%" },
    { nome: "Carreira Rápida", valor: "2,7%" },
    { nome: "Foco Total Educa", valor: "2,9%" },
  ],
}

export function AnalyticsRankingTable() {
  const [metric, setMetric] = useState<(typeof METRICS)[number]>("MRR")
  const rows = RANKINGS[metric]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Ranking de revendedores</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Top 10 revendedores pela métrica selecionada.
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                metric === m ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 font-medium">Posição</th>
              <th className="px-6 py-3 font-medium">Revendedor</th>
              <th className="px-6 py-3 font-medium">{metric}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.nome} className="border-b border-gray-100 last:border-b-0">
                <td className="px-6 py-3 font-mono text-xs text-gray-400">
                  {String(idx + 1).padStart(2, "0")}
                </td>
                <td className="px-6 py-3 font-medium text-[#1A1A2E]">{row.nome}</td>
                <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">
                  {row.valor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
