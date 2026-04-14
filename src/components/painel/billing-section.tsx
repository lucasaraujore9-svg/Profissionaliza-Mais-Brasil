"use client"

import { useState } from "react"
import { CheckCircle2, LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BillingSection() {
  const [autoBlock, setAutoBlock] = useState(true)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">
          Modo de cobrança inadimplentes
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Escolha como lidar com alunos que atrasarem pagamentos recorrentes.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAutoBlock(true)}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              autoBlock
                ? "border-blue-600 bg-blue-50/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1A1A2E]">
                Automático
              </span>
              {autoBlock && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Alunos inadimplentes são bloqueados na Escola Avançada após 3
              dias de atraso.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setAutoBlock(false)}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              !autoBlock
                ? "border-blue-600 bg-blue-50/50 shadow-sm"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1A1A2E]">
                Manual
              </span>
              {!autoBlock && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Você recebe notificação e decide quando bloquear cada aluno.
            </p>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#009EE3] text-white">
              MP
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1A1A2E]">
                Mercado Pago
              </h3>
              <p className="mt-1 text-xs text-gray-600">
                Integração responsável por receber pagamentos dos seus alunos.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                Não conectado
              </span>
            </div>
          </div>
          <Button className="bg-[#009EE3] text-white hover:bg-[#008cc8]">
            <LinkIcon className="mr-2 h-4 w-4" />
            Conectar Mercado Pago
          </Button>
        </div>
      </div>
    </div>
  )
}
