import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { runScheduleWindowSweep } from "@/lib/pedagogia/ea-window"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * JANELA DE HORARIO na fornecedora legada (a cada 15 min, pg_cron).
 *
 * Abre e fecha o acesso do aluno conforme os dias e horarios que a unidade
 * definiu. So alcanca cursos da fornecedora legada: nos da plataforma propria a
 * mesma janela e aplicada AULA A AULA pelo proprio LMS, sem cron nenhum.
 *
 * O intervalo de 15 minutos e o que define a PRECISAO da regra: uma janela que
 * fecha as 18:00 fecha, na pratica, entre 18:00 e 18:15. Aumentar o intervalo
 * economiza pouco e piora a promessa feita a unidade; diminuir multiplica
 * chamadas a fornecedora sem ganho perceptivel para o aluno.
 *
 * Idempotente: cada transicao so acontece a partir do estado que a habilita
 * (ver `setStudentScheduleBlock`), entao rodar duas vezes seguidas nao faz nada
 * na segunda.
 *
 * `?dryRun=1` calcula tudo e relata quem SERIA travado ou liberado sem escrever
 * nada e sem falar com a fornecedora — a forma de conferir o alcance real antes
 * da primeira execucao.
 */
export const POST = withRequestContext(
  { action: "cron.pedagogia_janela", route: "/api/cron/pedagogia-janela" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"
    const result = await runScheduleWindowSweep(new Date(), dryRun)
    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
