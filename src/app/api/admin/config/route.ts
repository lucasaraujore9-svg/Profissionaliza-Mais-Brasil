import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { getLastSuccessfulSync } from "@/lib/catalog/sync-log"
import {
  getSystemSettings,
  updatePmbDirectSaleGateway,
} from "@/lib/system-settings"
import { pmbMpAccessToken } from "@/lib/pmb-config"

export async function GET() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const [lastSync, settings] = await Promise.all([
    getLastSuccessfulSync(),
    getSystemSettings(),
  ])

  return NextResponse.json({
    data: {
      general: {
        appName: "Profissionaliza Mais Brasil",
        appDomain: process.env.NEXT_PUBLIC_APP_DOMAIN ?? "",
        supportEmail: "suporte@profissionalizamaisbrasil.com.br",
        pmbDirectSaleGateway: settings.pmbDirectSaleGateway,
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
          configured: Boolean(pmbMpAccessToken()),
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

const patchSchema = z.object({
  pmbDirectSaleGateway: z.enum(["MP", "ASAAS"]).optional(),
})

export async function PATCH(request: Request) {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode alterar configurações globais" },
      { status: 403 },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  if (parsed.data.pmbDirectSaleGateway === "ASAAS") {
    if (!process.env.ASAAS_API_URL || !process.env.ASAAS_API_KEY) {
      return NextResponse.json(
        { error: "Asaas não está configurado (faltam ASAAS_API_URL/ASAAS_API_KEY)" },
        { status: 400 },
      )
    }
  }
  if (parsed.data.pmbDirectSaleGateway === "MP") {
    if (!pmbMpAccessToken()) {
      return NextResponse.json(
        { error: "Mercado Pago PMB não está configurado (PMB_MP_ACCESS_TOKEN)" },
        { status: 400 },
      )
    }
  }

  if (parsed.data.pmbDirectSaleGateway) {
    const updated = await updatePmbDirectSaleGateway(
      parsed.data.pmbDirectSaleGateway,
    )
    return NextResponse.json({
      data: { pmbDirectSaleGateway: updated.pmbDirectSaleGateway },
    })
  }

  return NextResponse.json({ data: {} })
}
