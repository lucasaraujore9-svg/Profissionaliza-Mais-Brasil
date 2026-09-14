import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { contextLogger } from "@/lib/logger"
import { remediateLegacyMpLinks } from "@/lib/subscriptions/legacy-mp-link"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Remove os links do Mercado Pago gerados pela venda direta de assinatura do
 * /painel antes de 2026-09-14 (ver `lib/subscriptions/legacy-mp-link.ts`).
 *
 *   - default (dry-run): lista o que seria feito, sem escrever nem cancelar.
 *   - ?apply=true: cancela no MP, cancela a linha e reemite a venda com o link
 *     da loja. Quem já autorizou no MP, ou cujo estado não pôde ser lido, não é
 *     tocado.
 *
 * Auth: CRON_SECRET (Bearer). Disparo manual via app_internal.run_cron — roda
 * no runtime de produção, o único que decifra o token MP da unidade.
 */
async function handle(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true"
  const outcomes = await remediateLegacyMpLinks({ apply })

  contextLogger().info(
    { event: "cron.fix_subscription_mp_links.done", apply, outcomes },
    "remediacao de links MP de assinatura",
  )

  return NextResponse.json({ apply, count: outcomes.length, outcomes })
}

export const GET = handle
export const POST = handle
