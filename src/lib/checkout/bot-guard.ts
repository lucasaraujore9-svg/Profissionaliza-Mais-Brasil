import { checkBotId } from "botid/server"
import { NextResponse } from "next/server"
import { contextLogger } from "@/lib/logger"

/**
 * Recusa robo nos checkouts publicos (Vercel BotID, modo basico).
 *
 * Em 20/10/2026 um robo testou ~500 cartoes roubados chamando
 * `POST /api/loja/checkout` direto: 1.281 POSTs contra 10 aberturas da pagina.
 * Captcha so na tela nao teria barrado nada — a prova tem de ser conferida AQUI.
 * O BotID e por projeto (vale em todo dominio de unidade, sem cadastrar host) e
 * o script cliente (`src/instrumentation-client.ts`) anexa a prova so nos paths
 * listados la. Rota protegida aqui sem estar listada la recusa todo mundo.
 *
 * Fail-OPEN se o servico do BotID falhar: as travas por conta/cartao
 * (`card-guard.ts`) e o limite por IP continuam valendo.
 *
 * Devolve a resposta 403 a retornar, ou `null` para seguir.
 */
export async function rejectBot(): Promise<Response | null> {
  try {
    const verification = await checkBotId()
    if (!verification.isBot) return null
  } catch (err) {
    contextLogger().error({ err, event: "botid.check_failed" }, "BotID falhou — liberando")
    return null
  }
  contextLogger().warn({ event: "botid.blocked" }, "checkout recusado: robo")
  return NextResponse.json(
    {
      error: "Não foi possível validar o seu navegador. Atualize a página e tente de novo.",
      code: "BOT_DETECTED",
    },
    { status: 403 },
  )
}
