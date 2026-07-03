import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// LGPD-009: retenção/expurgo de PII de captação que hoje acumula indefinidamente.
// - `Lead` (B2B revenda): e-mail/telefone/CPF de interessados não convertidos.
// - `StudentLead`: nome/e-mail/telefone + IP/User-Agent de leads de curso.
// - `ContactMessage`: nome/e-mail/telefone/mensagem + IP/User-Agent de contatos.
// EmailLog já tem seu próprio mecanismo (DB-008 / cleanup-email-logs).
//
// Este endpoint é o MECANISMO (gated por cron secret); ele NÃO roda sozinho.
// ATIVAÇÃO = decisão do dono: confirmar os prazos (defaults abaixo, em dias) e
// registrar o job no pg_cron (fonte: prisma/sql/pg_cron_jobs.sql), idempotente
// por jobname, ex.:
//   select cron.schedule(
//     'pmb-sweep-stale-pii',
//     '45 3 * * 0',
//     $$ select app_internal.run_cron('/api/cron/sweep-stale-pii') $$
//   );
// Enquanto o job não for criado, nenhuma linha é apagada.
//
// Só remove registros TERMINAIS/não convertidos (Lead sem tenant vinculado;
// StudentLead ABANDONED/LOST; ContactMessage RESOLVED) — nunca toca pipeline
// ativo, conversões ou chamados abertos.
const LEAD_RETENTION_DAYS = Number(process.env.LEAD_RETENTION_DAYS ?? 548) // ~18 meses
const STUDENT_LEAD_RETENTION_DAYS = Number(process.env.STUDENT_LEAD_RETENTION_DAYS ?? 365)
const CONTACT_MESSAGE_RETENTION_DAYS = Number(process.env.CONTACT_MESSAGE_RETENTION_DAYS ?? 365)

function cutoffFor(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

export const POST = withRequestContext(
  { action: "cron.sweep_stale_pii", route: "/api/cron/sweep-stale-pii" },
  async (request: Request) => {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const log = contextLogger()
    const leadCutoff = cutoffFor(LEAD_RETENTION_DAYS)
    const studentLeadCutoff = cutoffFor(STUDENT_LEAD_RETENTION_DAYS)
    const contactCutoff = cutoffFor(CONTACT_MESSAGE_RETENTION_DAYS)

    log.info(
      {
        event: "cron.sweep_stale_pii.start",
        leadCutoff: leadCutoff.toISOString(),
        studentLeadCutoff: studentLeadCutoff.toISOString(),
        contactCutoff: contactCutoff.toISOString(),
      },
      "iniciando expurgo de PII de captação",
    )

    try {
      // Lead B2B nunca convertido (tenantId null) e parado além do prazo.
      // Conversões (tenantId != null) são preservadas.
      const leads = await prisma.lead.deleteMany({
        where: { tenantId: null, updatedAt: { lt: leadCutoff } },
      })

      // Leads de curso terminais (abandonados/descartados). WON é preservado.
      const studentLeads = await prisma.studentLead.deleteMany({
        where: { stage: { in: ["ABANDONED", "LOST"] }, updatedAt: { lt: studentLeadCutoff } },
      })

      // Chamados/contatos resolvidos além do prazo (com IP/User-Agent).
      const contacts = await prisma.contactMessage.deleteMany({
        where: { status: "RESOLVED", resolvedAt: { lt: contactCutoff } },
      })

      log.info(
        {
          event: "cron.sweep_stale_pii.done",
          leadsDeleted: leads.count,
          studentLeadsDeleted: studentLeads.count,
          contactMessagesDeleted: contacts.count,
        },
        "expurgo de PII concluído",
      )

      return NextResponse.json({
        data: {
          leadsDeleted: leads.count,
          studentLeadsDeleted: studentLeads.count,
          contactMessagesDeleted: contacts.count,
          retentionDays: {
            lead: LEAD_RETENTION_DAYS,
            studentLead: STUDENT_LEAD_RETENTION_DAYS,
            contactMessage: CONTACT_MESSAGE_RETENTION_DAYS,
          },
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      log.error(
        { err: error, event: "cron.sweep_stale_pii.failed" },
        "expurgo de PII falhou",
      )
      return NextResponse.json(
        { error: `Falha ao expurgar PII de captação: ${message}` },
        { status: 500 },
      )
    }
  },
)

export async function GET(request: Request) {
  return POST(request)
}
