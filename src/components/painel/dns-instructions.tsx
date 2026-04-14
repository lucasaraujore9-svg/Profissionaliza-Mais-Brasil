"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

export interface DnsRecord {
  type: string
  name: string
  value: string
}

interface DnsInstructionsProps {
  records: DnsRecord[]
}

export function DnsInstructions({ records }: DnsInstructionsProps) {
  const [open, setOpen] = useState(true)

  if (records.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-[#1A1A2E]">
          Instruções de DNS
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-4 py-4 text-xs text-gray-600">
          <p>
            Acesse o painel do seu provedor de DNS (Registro.br, Cloudflare,
            GoDaddy) e crie os registros abaixo:
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    Tipo
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    Nome
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {records.map((record, i) => (
                  <tr key={`${record.type}-${i}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-[#1A1A2E]">
                      {record.type}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">
                      {record.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">
                      {record.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-gray-500">
            A propagação pode levar até 48h. Depois de configurar, clique em
            Verificar.
          </p>
        </div>
      )}
    </div>
  )
}
