import { NextResponse } from "next/server"
import { z } from "zod"
import { getLastSuccessfulSync } from "@/lib/catalog/sync-log"
import {
  getSystemSettings,
  updatePmbDirectSaleGateway,
  updatePmbMpAccessToken,
  updatePmbInterestFreeInstallments,
  getPmbMpAccessTokenAsync,
} from "@/lib/system-settings"
import { MAX_CARD_INSTALLMENTS } from "@/lib/mercadopago/installments"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.config.get", route: "/api/admin/config" },
  async () => {
  const guard = await requireAdmin("configuracoes.view")
  if (!guard.ok) return guard.response

  const [lastSync, settings, mpToken] = await Promise.all([
    getLastSuccessfulSync(),
    getSystemSettings(),
    getPmbMpAccessTokenAsync(),
  ])

  const tokenSource: "db" | "env" | null = settings.pmbMpAccessTokenEnc
    ? "db"
    : process.env.PMB_MP_ACCESS_TOKEN
      ? "env"
      : null

  return NextResponse.json({
    data: {
      general: {
        appName: "Profissionaliza Mais Brasil",
        appDomain: process.env.NEXT_PUBLIC_APP_DOMAIN ?? "",
        supportEmail: "atendimento@profissionalizamaisbrasil.com.br",
        pmbDirectSaleGateway: settings.pmbDirectSaleGateway,
        pmbInterestFreeInstallments: settings.pmbInterestFreeInstallments,
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
          configured: Boolean(mpToken),
          tokenSource,
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
  },
)

const patchSchema = z.object({
  pmbDirectSaleGateway: z.enum(["MP", "ASAAS"]).optional(),
  pmbMpAccessToken: z.string().trim().min(1).max(500).nullable().optional(),
  pmbInterestFreeInstallments: z
    .number()
    .int()
    .min(1)
    .max(MAX_CARD_INSTALLMENTS)
    .optional(),
})

export const PATCH = withRequestContext(
  { action: "admin.config.update", route: "/api/admin/config" },
  async (request: Request) => {
  const guard = await requireAdmin("configuracoes.manage")
  if (!guard.ok) return guard.response
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

  // Token do Mercado Pago e escolha do gateway são CREDENCIAL, não preferência:
  // exigem `integracoes.manage`, a mesma permissão que /admin/configuracoes usa
  // para decidir se mostra o editor de gateway. Sem isto a UI escondia o campo
  // e um PATCH direto reescrevia o token em que toda venda direta liquida.
  const mexeEmCredencial =
    parsed.data.pmbMpAccessToken !== undefined ||
    parsed.data.pmbDirectSaleGateway !== undefined
  if (mexeEmCredencial && !guard.ctx.can("integracoes.manage")) {
    return NextResponse.json(
      { error: "Alterar o gateway ou o token exige a permissão de integrações" },
      { status: 403 },
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
    const existing = await getPmbMpAccessTokenAsync()
    if (!existing && !parsed.data.pmbMpAccessToken) {
      return NextResponse.json(
        { error: "Configure o token do Mercado Pago antes de selecionar este gateway" },
        { status: 400 },
      )
    }
  }

  if (parsed.data.pmbMpAccessToken !== undefined) {
    await updatePmbMpAccessToken(parsed.data.pmbMpAccessToken)
  }

  if (parsed.data.pmbInterestFreeInstallments !== undefined) {
    const updated = await updatePmbInterestFreeInstallments(
      parsed.data.pmbInterestFreeInstallments,
    )
    if (!parsed.data.pmbDirectSaleGateway) {
      return NextResponse.json({
        data: {
          pmbInterestFreeInstallments: updated.pmbInterestFreeInstallments,
        },
      })
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

  return NextResponse.json({ data: { ok: true } })
  },
)
