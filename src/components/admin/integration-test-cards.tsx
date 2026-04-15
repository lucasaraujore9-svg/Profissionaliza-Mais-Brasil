"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, Loader2, Plug } from "lucide-react"

type TestStatus = "idle" | "testing" | "ok" | "error"

interface IntegrationCardProps {
  title: string
  description: string
  brand: string
  brandClass: string
  endpoint: string
  configured: boolean
}

function IntegrationCard({
  title,
  description,
  brand,
  brandClass,
  endpoint,
  configured,
}: IntegrationCardProps) {
  const [status, setStatus] = useState<TestStatus>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  const handle = async () => {
    setStatus("testing")
    setMessage(null)
    setDurationMs(null)
    try {
      const res = await fetch(endpoint, { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setStatus("error")
        setMessage(body.error ?? "Falha ao testar conexão")
        return
      }
      const data = body.data as {
        status: "success" | "error"
        message: string
        durationMs: number
      }
      setStatus(data.status === "success" ? "ok" : "error")
      setMessage(data.message)
      setDurationMs(data.durationMs)
    } catch {
      setStatus("error")
      setMessage("Erro de rede ao testar conexão")
    }
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
        {!configured && status === "idle" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Não configurado
          </span>
        )}
      </div>
      <h4 className="mt-4 text-sm font-semibold text-[var(--color-pmb-green-900)]">{title}</h4>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
      {message && (
        <p
          className={`mt-3 text-xs ${
            status === "ok" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {message}
          {durationMs !== null && (
            <span className="ml-2 font-mono text-gray-500">({durationMs}ms)</span>
          )}
        </p>
      )}
      <button
        type="button"
        onClick={handle}
        disabled={status === "testing"}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-70"
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

export interface IntegrationsConfig {
  ea: { configured: boolean }
  asaas: { configured: boolean }
  mp: { configured: boolean }
}

interface IntegrationTestCardsProps {
  integrations: IntegrationsConfig
}

export function IntegrationTestCards({ integrations }: IntegrationTestCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <IntegrationCard
        title="Escola Avançada"
        description="API v2 para matrícula automática, bloqueio e sincronização de catálogo."
        brand="EA"
        brandClass="bg-[var(--color-pmb-green-900)]"
        endpoint="/api/admin/config/test-ea"
        configured={integrations.ea.configured}
      />
      <IntegrationCard
        title="Asaas"
        description="Processamento das assinaturas mensais dos revendedores."
        brand="AS"
        brandClass="bg-[#00B8D4]"
        endpoint="/api/admin/config/test-asaas"
        configured={integrations.asaas.configured}
      />
      <IntegrationCard
        title="Mercado Pago"
        description="Checkout multi-tenant dos alunos nas vitrines dos revendedores."
        brand="MP"
        brandClass="bg-[#009EE3]"
        endpoint="/api/admin/config/test-mp"
        configured={integrations.mp.configured}
      />
    </div>
  )
}
