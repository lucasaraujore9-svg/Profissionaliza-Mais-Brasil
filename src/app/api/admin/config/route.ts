import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { getLastSuccessfulSync } from "@/lib/catalog/sync-log"

export async function GET() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const lastSync = await getLastSuccessfulSync()

  return NextResponse.json({
    data: {
      general: {
        appName: "Profissionaliza Mais Brasil",
        appDomain: process.env.NEXT_PUBLIC_APP_DOMAIN ?? "",
        supportEmail: "suporte@profissionalizamaisbrasil.com.br",
      },
      integrations: {
        ea: {
          configured: Boolean(process.env.EA_API_URL && process.env.EA_API_TOKEN),
          baseUrl: process.env.EA_API_URL ?? null,
        },
        asaas: {
          configured: Boolean(process.env.ASAAS_API_URL && process.env.ASAAS_API_KEY),
          baseUrl: process.env.ASAAS_API_URL ?? null,
        },
        mp: {
          configured: true,
        },
      },
      webhooks: {
        asaasTokenConfigured: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
        cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      },
      system: {
        environment: process.env.NODE_ENV ?? "development",
        appVersion: process.env.npm_package_version ?? "0.1.0",
        lastSyncAt: lastSync?.at ?? null,
      },
    },
  })
}
