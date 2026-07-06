import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import {
  decryptTenantMpToken,
  getAccountInfo,
  createPayment,
  MPApiError,
} from "@/lib/mercadopago/client"
import type { MPCreatePaymentParams } from "@/lib/mercadopago/types"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Diagnóstico READ-ONLY da conexão Mercado Pago de UMA revenda, para investigar
 * "erro ao gerar o pagamento" que só acontece naquela unidade. Roda no runtime
 * de produção (onde ENCRYPTION_KEY existe), então é a única forma de decriptar o
 * `mpAccessToken` do tenant e checar a saúde real do gateway — o token nunca é
 * retornado nem logado.
 *
 * Auth: CRON_SECRET (Bearer). Dispare via app_internal.run_cron:
 *   select app_internal.run_cron('/api/cron/diag-tenant-mp?tenant=<slug>')
 * A resposta JSON fica em net._http_response (id = retorno do run_cron).
 *
 * Query:
 *   ?tenant=<slug>   (obrigatório) — slug da revenda a diagnosticar.
 *   ?probe=pix       (opcional)    — cria um pagamento PIX de R$1,00 NA CONTA DA
 *                                    UNIDADE via POST /v1/payments (o MESMO caminho
 *                                    do checkout real, mas sem cartão/PK) para
 *                                    reproduzir o erro server-side. Gera apenas um
 *                                    QR não pago (expira sozinho); nenhum valor é
 *                                    movimentado e nenhuma matrícula é efetivada.
 *
 * O que revela:
 *   - token: se decripta, se /users/me responde, o id/país da conta VIVA e se
 *     bate com o mpUserId salvo. Token inválido/expirado/rotacionado aparece aqui.
 *   - publicKey: prefixo/len (sem expor o valor) — para checar formato/ambiente.
 *   - pixProbe (quando ?probe=pix): status do pagamento OU o corpo do erro MP,
 *     que é exatamente o que estoura no `createPayment` do checkout.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const slug = url.searchParams.get("tenant")?.trim()
  const doPixProbe = url.searchParams.get("probe") === "pix"
  if (!slug) {
    return NextResponse.json(
      { error: "Informe ?tenant=<slug>", code: "MISSING_TENANT" },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      salesGateway: true,
      mpConnected: true,
      mpUserId: true,
      mpAccessToken: true,
      mpPublicKey: true,
      mpWebhookSecret: true,
    },
  })

  if (!tenant) {
    return NextResponse.json(
      { error: "Revenda não encontrada", code: "TENANT_NOT_FOUND" },
      { status: 404 },
    )
  }

  const report: Record<string, unknown> = {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      salesGateway: tenant.salesGateway,
      mpConnected: tenant.mpConnected,
      mpUserIdStored: tenant.mpUserId,
      hasWebhookSecret: tenant.mpWebhookSecret !== null,
    },
    publicKey: tenant.mpPublicKey
      ? {
          present: true,
          prefix: tenant.mpPublicKey.slice(0, 16),
          length: tenant.mpPublicKey.length,
          isProd: tenant.mpPublicKey.startsWith("APP_USR-"),
          isTest: tenant.mpPublicKey.startsWith("TEST-"),
        }
      : { present: false },
  }

  // ── Token: decripta + valida em /users/me ──────────────────────────────────
  if (!tenant.mpAccessToken) {
    report.token = { present: false }
    return NextResponse.json({ data: report })
  }

  let accessToken: string
  try {
    accessToken = decryptTenantMpToken(tenant.mpAccessToken)
  } catch (error) {
    // Decripta falhou = token cifrado com outra ENCRYPTION_KEY (ou corrompido).
    // Isto sozinho quebra TODA venda desta revenda no createPayment/decrypt.
    report.token = {
      present: true,
      decrypted: false,
      error: error instanceof Error ? error.message : String(error),
    }
    contextLogger().error(
      { event: "diag_tenant_mp.decrypt_failed", tenantId: tenant.id },
      "diag MP: falha ao decriptar mpAccessToken",
    )
    return NextResponse.json({ data: report })
  }

  const tokenReport: Record<string, unknown> = {
    present: true,
    decrypted: true,
    prefix: accessToken.slice(0, 8),
    isProd: accessToken.startsWith("APP_USR-"),
    isTest: accessToken.startsWith("TEST-"),
  }
  try {
    const account = await getAccountInfo(accessToken)
    tokenReport.usersMeOk = true
    tokenReport.liveAccountId = String(account.id)
    tokenReport.siteId = account.site_id ?? null
    tokenReport.nickname = account.nickname ?? null
    tokenReport.matchesStoredUserId =
      tenant.mpUserId != null && String(account.id) === tenant.mpUserId
    tokenReport.isBrazil = account.site_id === "MLB"
  } catch (error) {
    tokenReport.usersMeOk = false
    if (error instanceof MPApiError) {
      tokenReport.mpStatusCode = error.statusCode
      tokenReport.mpErrorBody = error.body ?? null
    } else {
      tokenReport.error = error instanceof Error ? error.message : String(error)
    }
  }
  report.token = tokenReport

  // ── Sonda PIX opcional: reproduz o POST /v1/payments do checkout real ───────
  if (doPixProbe && tokenReport.usersMeOk) {
    const params: MPCreatePaymentParams = {
      transaction_amount: 1,
      description: "Diagnóstico PMB (não pagar)",
      payment_method_id: "pix",
      external_reference: `diag-mp-${tenant.slug}`,
      payer: {
        email: "diagnostico@bmbr.com.br",
        first_name: "Diagnostico",
        last_name: "PMB",
        identification: { type: "CPF", number: "19119119100" },
      },
    }
    try {
      const payment = await createPayment(
        accessToken,
        params,
        `diag-mp-${tenant.slug}`,
      )
      report.pixProbe = {
        ok: true,
        paymentId: String(payment.id),
        status: payment.status,
        statusDetail: payment.status_detail,
        hasQrCode: Boolean(payment.point_of_interaction?.transaction_data?.qr_code),
      }
    } catch (error) {
      const probe: Record<string, unknown> = { ok: false }
      if (error instanceof MPApiError) {
        probe.mpStatusCode = error.statusCode
        probe.mpErrorBody = error.body ?? null
      } else {
        probe.error = error instanceof Error ? error.message : String(error)
      }
      report.pixProbe = probe
      contextLogger().error(
        { event: "diag_tenant_mp.pix_probe_failed", tenantId: tenant.id, probe },
        "diag MP: sonda PIX falhou",
      )
    }
  }

  return NextResponse.json({ data: report })
}

const wrapped = withRequestContext(
  { action: "cron.diag_tenant_mp", route: "/api/cron/diag-tenant-mp" },
  handle,
)

export const GET = wrapped
export const POST = wrapped
