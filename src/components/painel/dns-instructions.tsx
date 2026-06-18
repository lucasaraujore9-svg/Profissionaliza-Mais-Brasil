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
        <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
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
          {/* Desktop: tabela */}
          <div className="mt-3 hidden overflow-x-auto rounded-lg border border-gray-200 sm:block">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-[var(--color-pmb-green-900)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-pmb-green-900)]">
                    Tipo
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-pmb-green-900)]">
                    Nome
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--color-pmb-green-900)]">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {records.map((record, i) => (
                  <tr
                    key={`${record.type}-${i}`}
                    className="transition-colors hover:bg-[var(--color-pmb-lime-50)]/50"
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-[var(--color-pmb-green-900)]">
                      {record.type}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">
                      {record.name}
                    </td>
                    <td className="px-3 py-2 font-mono break-all text-gray-700">
                      {record.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados */}
          <div className="mt-3 space-y-2 sm:hidden">
            {records.map((record, i) => (
              <div
                key={`m-${record.type}-${i}`}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="font-semibold text-gray-500">Tipo</dt>
                    <dd className="font-mono font-semibold text-[var(--color-pmb-green-900)]">
                      {record.type}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-semibold text-gray-500">Nome</dt>
                    <dd className="font-mono break-all text-right text-gray-700">
                      {record.name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-semibold text-gray-500">Valor</dt>
                    <dd className="font-mono break-all text-right text-gray-700">
                      {record.value}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
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
