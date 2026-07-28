import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  validateAsaasWebhook,
  parseAsaasWebhookPayload,
} from "@/lib/asaas/webhook"
import { processAsaasWebhook } from "@/lib/asaas/process"
import { processResellerAsaasWebhook } from "@/lib/asaas/reseller-process"
import { redactWebhookPayload } from "@/lib/webhooks/redact-payload"
import { decrypt } from "@/lib/crypto"
import {
  runWithRequestContext,
  extendRequestContext,
} from "@/lib/observability/request-context"
import { contextLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Asaas exige <22s de resposta — mas como fulfill é idempotente,
// preferimos await + retry do Asaas a fire-and-forget que perde eventos.
export const maxDuration = 60

function pickHeaders(request: Request): Record<string, string> {
  // Redact `asaas-access-token` ao persistir no WebhookLog: o valor cru
  // permitiria a alguém com acesso ao DB forjar webhooks. Guardamos apenas
  // os primeiros e últimos 4 chars + sufixo de hash para troubleshooting de
  // configs erradas sem expor o segredo inteiro.
  const keys = ["user-agent", "content-type", "x-forwarded-for"]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = request.headers.get(key)
    if (value) out[key] = value
  }
  const tokenRaw = request.headers.get("asaas-access-token")
  if (tokenRaw) {
    const len = tokenRaw.length
    out["asaas-access-token"] =
      len > 8 ? `${tokenRaw.slice(0, 4)}…${tokenRaw.slice(-4)} (len=${len})` : "[redacted]"
  }
  return out
}

export async function POST(request: Request) {
  return runWithRequestContext(
    { action: "asaas.webhook", route: "/api/webhooks/asaas" },
    () => handle(request),
  )
}

// Compara dois tokens em tempo constante, tolerante a tamanhos diferentes.
function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * Webhook da conta Asaas PRÓPRIA de uma unidade (?tenant=<slug> na URL que a
 * unidade colou no painel Asaas dela). Diferente do webhook global da PMB: a
 * autenticação é o token por-tenant (asaas_webhook_token, criptografado), não a
 * env ASAAS_WEBHOOK_TOKEN. Resolve o tenant ANTES de validar (o segredo é dele).
 */
async function handleReseller(request: Request, slug: string) {
  const log = contextLogger()
  const headerToken = request.headers.get("asaas-access-token")

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      plataformaVendedorId: true,
      asaasApiKey: true,
      asaasWebhookToken: true,
      asaasConnected: true,
    },
  })

  // Sem tenant / sem credenciais → 401 genérico (não revela qual slug existe).
  if (
    !tenant ||
    !tenant.asaasConnected ||
    !tenant.asaasWebhookToken ||
    !tenant.asaasApiKey
  ) {
    log.warn({ event: "asaas.reseller_webhook.unconfigured", slug }, "tenant sem Asaas configurado")
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }

  let expectedToken: string
  let apiKey: string
  try {
    expectedToken = decrypt(tenant.asaasWebhookToken)
    apiKey = decrypt(tenant.asaasApiKey)
  } catch (error) {
    log.error({ err: error, event: "asaas.reseller_webhook.decrypt_error", slug }, "falha ao descriptografar credenciais")
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }

  if (!headerToken || !tokensMatch(headerToken, expectedToken)) {
    log.warn({ event: "asaas.reseller_webhook.invalid_token", slug }, "token por-tenant inválido")
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    log.warn({ err, event: "asaas.reseller_webhook.invalid_json" }, "body não é JSON válido")
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  let payload
  try {
    payload = parseAsaasWebhookPayload(body)
  } catch (err) {
    log.warn({ err, event: "asaas.reseller_webhook.invalid_payload" }, "payload Asaas falhou validação")
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }

  const dbLog = await prisma.webhookLog.create({
    data: {
      source: "ASAAS",
      tenantId: tenant.id,
      eventType: payload.event,
      // OBS-008/LGPD-014: redige CPF/e-mail/telefone do customer antes de
      // persistir (mantém ids/status/valores para troubleshooting).
      payload: redactWebhookPayload(body) as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  extendRequestContext({ webhookLogId: dbLog.id, eventType: payload.event, tenantId: tenant.id })

  try {
    await processResellerAsaasWebhook(
      dbLog.id,
      {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plataformaVendedorId: tenant.plataformaVendedorId,
        apiKey,
      },
      payload,
    )
  } catch (error) {
    // 500 → Asaas reentrega. Processador é idempotente (asaasPaymentId).
    log.error(
      { err: error, event: "asaas.reseller_webhook.processing_failed", webhookLogId: dbLog.id },
      "processResellerAsaasWebhook lançou — Asaas vai retentar",
    )
    return NextResponse.json({ error: "processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

async function handle(request: Request) {
  const log = contextLogger()

  // ?tenant=<slug> → webhook da conta Asaas própria de uma unidade. Sem slug =
  // webhook global da PMB (mensalidades dos revendedores + vitrine PMB).
  const rawSlug = new URL(request.url).searchParams.get("tenant")
  const slug =
    rawSlug && /^[a-z0-9_-]{1,64}$/i.test(rawSlug) ? rawSlug : null
  if (slug) {
    return handleReseller(request, slug)
  }

  const token = request.headers.get("asaas-access-token")

  try {
    if (!validateAsaasWebhook(token)) {
      log.warn({ event: "asaas.webhook.invalid_token" }, "token inválido")
      return NextResponse.json({ error: "invalid token" }, { status: 401 })
    }
  } catch (error) {
    // Detalhe fica no log (interno); ao chamador não-autenticado devolvemos
    // mensagem genérica para não vazar estado de configuração do servidor.
    log.error({ err: error, event: "asaas.webhook.config_error" }, "erro de config no validateAsaasWebhook")
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (err) {
    log.warn({ err, event: "asaas.webhook.invalid_json" }, "body não é JSON válido")
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  let payload
  try {
    payload = parseAsaasWebhookPayload(body)
  } catch (err) {
    log.warn({ err, event: "asaas.webhook.invalid_payload" }, "payload Asaas falhou validação Zod")
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }

  const dbLog = await prisma.webhookLog.create({
    data: {
      source: "ASAAS",
      eventType: payload.event,
      // OBS-008/LGPD-014: redige CPF/e-mail/telefone do customer antes de persistir.
      payload: redactWebhookPayload(body) as never,
      headers: pickHeaders(request) as never,
      processed: false,
    },
    select: { id: true },
  })

  extendRequestContext({ webhookLogId: dbLog.id, eventType: payload.event })
  log.info({ event: "asaas.webhook.received", webhookLogId: dbLog.id, eventType: payload.event }, "webhook Asaas recebido")

  try {
    await processAsaasWebhook(dbLog.id, payload)
    log.info({ event: "asaas.webhook.processed", webhookLogId: dbLog.id }, "webhook Asaas processado")
  } catch (error) {
    // 500 → Asaas retenta. Processador é idempotente (asaasPaymentId check).
    log.error(
      { err: error, event: "asaas.webhook.processing_failed", webhookLogId: dbLog.id },
      "processAsaasWebhook lançou — Asaas vai retentar",
    )
    return NextResponse.json({ error: "processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
