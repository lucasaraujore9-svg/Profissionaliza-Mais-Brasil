import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  auditStudentPlatformState,
  type PlatformStateAudit,
} from "@/lib/students/plataforma-actions"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Remediação do incidente de 2026-08-05: aluno ativo rebaixado a "interessado"
 * na plataforma de aulas.
 *
 * `usuarios/editar` não é um PATCH — campo omitido volta ao default da
 * plataforma, e o default de `status` é `interessado` (lead sem acesso). A troca
 * de senha mandava `{ id_aluno, senha }` sozinho, então todo aluno que passou
 * por ela (ou por uma edição de perfil) pode ter perdido as aulas em silêncio:
 * do nosso lado `Student.status` continuava `ATIVO`. O código foi fechado em
 * `plataforma-actions.pushPlatformState`; esta varredura conserta quem já foi
 * atingido.
 *
 * Também alinha `bolsista`: quem entrou por cupom de 100% ia para a plataforma
 * como aluno pagante, e portanto para o módulo financeiro da fornecedora.
 *
 * Roda no runtime de produção (onde EA_API_* existe), disparada via
 * `app_internal.run_cron('/api/cron/resync-platform-state')` — a função
 * concatena `app_url || path`, então query string funciona. Não é agendada: é
 * manutenção sob demanda.
 *
 * ⚠️ `run_cron` usa `timeout_milliseconds := 60000`. Passar de 60s não aborta a
 * execução (a função da Vercel segue até `maxDuration`), mas o pg_net desiste
 * de esperar e a resposta NÃO aparece em `net._http_response`. Para conseguir
 * ler o relatório, varra em lotes (`?limit=80`); rodando sem limite, o que
 * sobra é a notificação ao SUPER_ADMIN e o log.
 *
 * Query params:
 *   apply=1        corrige de fato (default: dry-run, só relata)
 *   ids=4455,4465  limita a `ea_aluno_id` específicos
 *   limit=500      teto de alunos varridos quando `ids` não é passado
 *
 * Auth: Bearer CRON_SECRET (padrão dos demais crons).
 */

// Cada aluno custa 1 leitura na plataforma (+1 escrita quando diverge), serial
// dentro do lote. Concorrência baixa para não estourar a cota da fornecedora.
const CONCURRENCY = 5
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000

async function resync(opts: { ids: string[]; apply: boolean; limit: number }) {
  const students = await prisma.student.findMany({
    where: opts.ids.length
      ? { plataformaAlunoId: { in: opts.ids } }
      : { plataformaAlunoId: { not: { startsWith: "pending" } } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    ...(opts.ids.length ? {} : { take: opts.limit }),
  })

  const tally = {
    scanned: 0,
    ok: 0,
    diverged: 0,
    fixed: 0,
    skipped: 0,
    failed: 0,
  }
  // Só devolvemos o que NÃO está ok — a resposta fica inspecionável em
  // `net._http_response` e uma lista com a base inteira não ajuda ninguém.
  const details: PlatformStateAudit[] = []

  async function processOne(s: { id: string }): Promise<void> {
    tally.scanned += 1
    let audit: PlatformStateAudit
    try {
      audit = await auditStudentPlatformState(s.id, { apply: opts.apply })
    } catch (err) {
      tally.failed += 1
      contextLogger().error(
        { err, event: "cron.resync_platform_state.student_failed", studentId: s.id },
        "auditoria de estado na plataforma falhou",
      )
      return
    }

    switch (audit.outcome) {
      case "ok":
        tally.ok += 1
        return
      case "diverged":
        tally.diverged += 1
        break
      case "fixed":
        tally.fixed += 1
        break
      case "failed":
        tally.failed += 1
        break
      default:
        tally.skipped += 1
        // "ainda não foi para a plataforma" é o caso comum e esperado (matrícula
        // pendente) — não polui o relatório.
        if (audit.outcome === "skipped_not_on_platform") return
    }
    details.push(audit)
  }

  for (let i = 0; i < students.length; i += CONCURRENCY) {
    await Promise.all(students.slice(i, i + CONCURRENCY).map(processOne))
  }

  return { apply: opts.apply, tally, details }
}

export const POST = withRequestContext(
  {
    action: "cron.resync_platform_state",
    route: "/api/cron/resync-platform-state",
  },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const url = new URL(request.url)
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const apply = url.searchParams.get("apply") === "1"
    const limit = Math.min(
      Number(url.searchParams.get("limit")) || DEFAULT_LIMIT,
      MAX_LIMIT,
    )

    const result = await resync({ ids, apply, limit })

    contextLogger().info(
      { event: "cron.resync_platform_state.done", apply, ...result.tally },
      "resync-platform-state concluído",
    )

    // Divergência encontrada é sintoma de aluno pagante sem aula — o dono
    // precisa saber mesmo quando a varredura roda em dry-run.
    const pending = result.tally.diverged + result.tally.failed
    if (pending > 0) {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "ERROR",
        title: "Alunos com estado divergente na plataforma de aulas",
        body: `${result.tally.diverged} aluno(s) com status/bolsista fora do nosso registro e ${result.tally.failed} falha(s) na varredura. Rode com ?apply=1 para corrigir.`,
        category: "cron",
        href: "/admin/alunos",
      }).catch(() => undefined)
    }

    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
