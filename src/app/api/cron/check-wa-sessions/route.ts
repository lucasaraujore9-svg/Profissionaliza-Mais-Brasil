import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { checkWaSessionsHealth } from "@/lib/automation/health"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Saude das sessoes de WhatsApp das unidades.
 *
 * Por que existe: a sessao morre no engine sem avisar ninguem, e o painel
 * continuava exibindo "conectado" porque o snapshot `waStatus` so era reescrito
 * quando alguem abria a tela de conexao. Resultado medido em 2026-08-07: 26 das
 * 45 unidades ditas conectadas estavam FAILED — automacao parada em silencio.
 *
 * O disparo por acao (formulario, pagamento, abandono) ja confere o engine e
 * avisa, mas so quando ha um lead. Sem esta varredura, uma unidade sem
 * movimento fica semanas desconectada e so descobre quando perde a venda.
 *
 * Reconectar exige ler o QR, o que so o dono faz — daqui sai deteccao e aviso,
 * mais a religada automatica dos casos em que o worker caiu com a credencial
 * ainda valida. Idempotente (o aviso tem cooldown de 24h).
 */
async function process() {
  return checkWaSessionsHealth()
}

export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await process()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
