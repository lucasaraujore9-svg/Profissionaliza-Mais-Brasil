"use client"

import { useState } from "react"
import Link from "next/link"

export interface AnalyticsRankingRow {
  id: string
  name: string
  slug: string
  value: number
}

export interface AnalyticsRankings {
  mrr: AnalyticsRankingRow[]
  students: AnalyticsRankingRow[]
}

interface AnalyticsRankingTableProps {
  rankings: AnalyticsRankings
}

const METRICS = ["MRR", "Alunos"] as const
type Metric = (typeof METRICS)[number]

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function AnalyticsRankingTable({ rankings }: AnalyticsRankingTableProps) {
  const [metric, setMetric] = useState<Metric>("MRR")
  const rows = metric === "MRR" ? rankings.mrr : rankings.students

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
      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-xs text-gray-500">
          Nenhum revendedor para ranquear.
        </div>
      ) : (
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
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-6 py-3 font-mono text-xs text-gray-400">
                    {String(idx + 1).padStart(2, "0")}
                  </td>
                  <td className="px-6 py-3 font-medium text-[#1A1A2E]">
                    <Link
                      href={`/admin/revendedores/${row.id}`}
                      className="hover:text-blue-600"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 font-mono font-semibold text-[#1A1A2E]">
                    {metric === "MRR"
                      ? formatMoney(row.value)
                      : row.value.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
