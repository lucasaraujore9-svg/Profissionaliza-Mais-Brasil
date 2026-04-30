"use client"

import { useEffect, useState } from "react"
import {
  AdminConfigTabs,
  type GeneralConfigData,
} from "./admin-config-tabs"
import type { IntegrationsConfig } from "./integration-test-cards"
import type { WebhookConfigData } from "./webhook-config"
import type { SystemInfoData } from "./system-info"

interface ConfigResponse {
  general: GeneralConfigData
  integrations: IntegrationsConfig
  webhooks: WebhookConfigData
  system: SystemInfoData
}

interface AdminConfigClientProps {
  canEditGateway: boolean
}

export function AdminConfigClient({ canEditGateway }: AdminConfigClientProps) {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/config")
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar configurações")
          return
        }
        setConfig(body.data as ConfigResponse)
      } catch {
        setError("Erro de rede ao carregar configurações")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading && !config) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando configurações...
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }
  if (!config) return null

  return (
    <AdminConfigTabs
      general={config.general}
      integrations={config.integrations}
      webhooks={config.webhooks}
      system={config.system}
      canEditGateway={canEditGateway}
    />
  )
}
