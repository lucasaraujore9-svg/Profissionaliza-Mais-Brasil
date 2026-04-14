"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, Loader2, Plug } from "lucide-react"

type TestStatus = "idle" | "testing" | "ok" | "error"

interface IntegrationCardProps {
  title: string
  description: string
  brand: string
  brandClass: string
}

function IntegrationCard({ title, description, brand, brandClass }: IntegrationCardProps) {
  const [status, setStatus] = useState<TestStatus>("idle")

  const handle = () => {
    setStatus("testing")
    setTimeout(() => setStatus("ok"), 1200)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${brandClass}`}
        >
          {brand}
        </div>
        {status === "ok" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Online
          </span>
        )}
        {status === "error" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            <XCircle className="h-3 w-3" />
            Falha
          </span>
        )}
      </div>
      <h4 className="mt-4 text-sm font-semibold text-[#1A1A2E]">{title}</h4>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
      <button
        type="button"
        onClick={handle}
        disabled={status === "testing"}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-70"
      >
        {status === "testing" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Testando...
          </>
        ) : (
          <>
            <Plug className="h-3.5 w-3.5" />
            Testar conexão
          </>
        )}
      </button>
    </div>
  )
}

export function IntegrationTestCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <IntegrationCard
        title="Escola Avançada"
        description="API v2 para matrícula automática, bloqueio e sincronização de catálogo."
        brand="EA"
        brandClass="bg-[#1A1A2E]"
      />
      <IntegrationCard
        title="Asaas"
        description="Processamento das assinaturas mensais dos revendedores."
        brand="AS"
        brandClass="bg-[#00B8D4]"
      />
      <IntegrationCard
        title="Mercado Pago"
        description="Checkout multi-tenant dos alunos nas vitrines dos revendedores."
        brand="MP"
        brandClass="bg-[#009EE3]"
      />
    </div>
  )
}
