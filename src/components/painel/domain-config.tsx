"use client"

import { useCallback, useEffect, useState } from "react"
import { SubdomainDisplay } from "./subdomain-display"
import {
  CustomDomainForm,
  type DomainStatus,
} from "./custom-domain-form"
import type { DnsRecord } from "./dns-instructions"

interface DomainInfo {
  subdomain: string
  appDomain: string
  subdomainFull: string
  customDomain: string | null
  status: DomainStatus
  dnsRecords: DnsRecord[]
  vercelConfigured?: boolean
}

export function DomainConfig() {
  const [info, setInfo] = useState<DomainInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/painel/dominio")
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar domínio")
        return
      }
      setInfo(body.data)
    } catch {
      setError("Erro de rede ao carregar domínio")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = useCallback(async (domain: string) => {
    const res = await fetch("/api/painel/dominio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    })
    const body = await res.json()
    if (!res.ok) {
      const fields = body.fields as Record<string, string[]> | undefined
      const fieldError = fields ? Object.values(fields)[0]?.[0] : undefined
      throw new Error(fieldError ?? body.error ?? "Falha ao adicionar domínio")
    }
    setInfo(body.data)
  }, [])

  const handleVerify = useCallback(async () => {
    const res = await fetch("/api/painel/dominio/verify", { method: "POST" })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(body.error ?? "Falha ao verificar")
    }
    await load()
  }, [load])

  const handleRemove = useCallback(async () => {
    const res = await fetch("/api/painel/dominio", { method: "DELETE" })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(body.error ?? "Falha ao remover domínio")
    }
    setInfo(body.data)
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando configuração de domínio...
      </div>
    )
  }

  if (error || !info) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error ?? "Erro desconhecido"}
      </div>
    )
  }

  return (
    <>
      <SubdomainDisplay
        subdomain={info.subdomain}
        appDomain={info.appDomain}
      />
      {info.vercelConfigured === false ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Domínio personalizado temporariamente indisponível. Use o subdomínio
          oficial acima ou entre em contato com o suporte.
        </div>
      ) : null}
      <CustomDomainForm
        customDomain={info.customDomain}
        status={info.status}
        dnsRecords={info.dnsRecords}
        onAdd={handleAdd}
        onVerify={handleVerify}
        onRemove={handleRemove}
      />
    </>
  )
}
