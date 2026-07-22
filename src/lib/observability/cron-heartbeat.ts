/**
 * Batimento dos jobs agendados.
 *
 * PROBLEMA QUE RESOLVE: os crons vivem no pg_cron do Supabase, que chama nossas
 * rotas por HTTP. Quando essa ponte quebra, ninguem fica sabendo — entre 30/04 e
 * 10/06 de 2026 o `pg_net` mudou de schema e TODOS os jobs pararam por seis
 * semanas sem um unico alerta. `cron.job_run_details` nao basta: ele prova que o
 * Postgres disparou, nao que a nossa rota executou.
 *
 * Aqui gravamos do lado da aplicacao: se a linha do job esta velha, o job nao
 * esta rodando de verdade — nao importa o que o agendador diga.
 */
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

/**
 * Autoriza a chamada do cron E registra o batimento — nesta ordem, e so quando
 * autorizada (uma requisicao sem o CRON_SECRET nao pode falsear saude).
 *
 * Esta funcao existe para ser o UNICO ponto de entrada dos jobs: as 23 rotas de
 * cron ja compartilhavam o mesmo preambulo de autorizacao, entao ancorar o
 * batimento aqui da cobertura completa sem depender de cada rota lembrar de
 * registrar-se — que e exatamente como monitoramento morre com o tempo.
 *
 * Grava a INVOCACAO, nao o sucesso do trabalho: o resultado de cada job segue
 * nos logs estruturados. O que esta tabela responde e "este job ainda esta
 * rodando?", que era a pergunta sem resposta.
 */
export async function authorizeCron(request: Request): Promise<boolean> {
  if (!isCronAuthorized(request)) return false
  const jobName = cronJobNameFromRequest(request)
  if (jobName) await recordCronRun(jobName)
  return true
}

/**
 * Deriva o nome do job da URL da rota: `/api/cron/sync-progresso` →
 * "sync-progresso". Assim um job novo passa a ser monitorado no instante em que
 * a rota existe, sem ninguem lembrar de registra-lo numa lista.
 */
export function cronJobNameFromRequest(request: Request): string | null {
  try {
    const path = new URL(request.url).pathname
    const match = path.match(/\/api\/cron\/([^/?]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Registra que o job rodou agora. NUNCA lanca e NUNCA bloqueia o trabalho do
 * cron — um monitor que derruba o que monitora e pior que monitor nenhum.
 */
export async function recordCronRun(jobName: string): Promise<void> {
  try {
    await prisma.cronRun.upsert({
      where: { jobName },
      update: { lastRunAt: new Date(), runCount: { increment: 1 } },
      create: { jobName, lastRunAt: new Date(), runCount: 1 },
    })
  } catch (err) {
    // O proprio log e best-effort DENTRO do best-effort. Parece paranoia, mas
    // um `catch` que lanca anula a garantia inteira: a excecao subiria para o
    // `authorizeCron` e derrubaria — com 401/500 — justamente o job que este
    // codigo so deveria observar. Monitor nao pode ter voto sobre a execucao.
    try {
      contextLogger().warn(
        { err, event: "cron.heartbeat_failed", jobName },
        "falha ao gravar o batimento do cron (degrada — o job segue normalmente)",
      )
    } catch {
      // sem log disponivel: silencio e melhor que derrubar o cron
    }
  }
}

/**
 * Quanto tempo cada job pode passar sem rodar antes de ser considerado ATRASADO.
 * Folga generosa sobre a cadencia real (ver prisma/sql/pg_cron_jobs.sql) para
 * nao acusar atraso por uma rodada perdida — o objetivo e pegar job PARADO, nao
 * oscilacao. Job ausente daqui cai no padrao diario.
 */
const OVERDUE_HOURS: Record<string, number> = {
  "reactivate-paid": 3, // de hora em hora
  "sync-day-update-lms": 3, // de hora em hora
  "sweep-abandoned-leads": 6, // a cada 2h
  "sweep-tenants-overdue": 14, // a cada 6h
  "referral-monthly-payout": 24 * 33, // mensal (dia 20)
  "cleanup-webhook-logs": 24 * 33, // mensal
  "sweep-visitor-events": 24 * 9, // semanal
}
const DEFAULT_OVERDUE_HOURS = 26 // diario + folga

export interface CronHealthRow {
  jobName: string
  lastRunAt: Date
  runCount: number
  hoursSinceLastRun: number
  overdue: boolean
}

/**
 * Estado de saude de todos os jobs conhecidos, do mais atrasado para o menos.
 * Alimenta a tela do admin — "nao roda ha X horas" em vez de silencio.
 */
export async function getCronHealth(now: Date = new Date()): Promise<CronHealthRow[]> {
  const runs = await prisma.cronRun.findMany({ orderBy: { lastRunAt: "asc" } })
  return runs.map((r) => {
    const hours = (now.getTime() - r.lastRunAt.getTime()) / 3_600_000
    return {
      jobName: r.jobName,
      lastRunAt: r.lastRunAt,
      runCount: r.runCount,
      hoursSinceLastRun: Math.round(hours * 10) / 10,
      overdue: hours > (OVERDUE_HOURS[r.jobName] ?? DEFAULT_OVERDUE_HOURS),
    }
  })
}
