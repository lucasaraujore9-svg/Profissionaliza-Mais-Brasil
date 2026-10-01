/**
 * Lembretes de vencimento da mensalidade da unidade.
 *
 * Três janelas, definidas em `REMINDER_OFFSETS`: 5 dias antes, 2 dias antes e no
 * dia do vencimento. Cada disparo cria uma notificação in-app para o DONO da
 * unidade (categoria `tenant-billing` é owner-only em `createNotification`) e
 * manda o mesmo aviso por email, com a marca da unidade.
 *
 * IDEMPOTÊNCIA: cada (cobrança, janela) é reivindicada em
 * `TenantPaymentReminder` ANTES do disparo. Quem consegue inserir manda o aviso;
 * uma segunda execução no mesmo dia insere zero linhas e não avisa nada. Isso
 * importa porque o pg_net re-tenta, o job pode ser rodado à mão e um deploy no
 * meio da janela reexecuta a rota.
 *
 * EMAIL COM RETENTATIVA: a linha reivindicada só prova o aviso in-app. O email
 * é entregue numa segunda fase: `emailedAt` é reivindicado antes do envio e
 * DEVOLVIDO a nulo se nenhum provedor aceitar. Enquanto estiver nulo e a
 * cobrança seguir em aberto, toda execução tenta de novo — com o texto do dia
 * ("vence em 4 dias"), não o da janela original. Antes
 * o email saía em background pela ponte, sem resultado: nos apagões de SMTP de
 * setembro/2026 a janela ficou marcada como avisada e o email nunca saiu.
 */
import { prisma } from "@/lib/prisma"
import { createNotification, sendTenantNotificationEmails } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { brDayStartUtc, daysUntilBrDay } from "@/lib/dates"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { OPEN_STATUSES, REMINDER_OFFSETS } from "./types"

const MS_PER_DAY = 86_400_000
/**
 * Teto da fase de email. A rota tem 300s; com o SMTP fora do ar cada envio pode
 * esperar vaga no pool e ainda percorrer os provedores de reserva. O que não
 * couber fica pendente para a próxima execução.
 */
const EMAIL_BUDGET_MS = 240_000

/** Cobrança que ainda pede aviso: em aberto, não quitada, e não é da própria PMB. */
const REMINDABLE_CHARGE = {
  status: { in: [...OPEN_STATUSES] },
  // Quitada na mão pelo financeiro: não é dívida, não cobra.
  markedPaidAt: null,
  paidAt: null,
  // A PMB não cobra mensalidade de si mesma.
  tenant: { slug: { not: PMB_TENANT_SLUG } },
}

export interface ReminderResult {
  /** Cobranças inspecionadas (em aberto e dentro de alguma janela). */
  inspected: number
  /** Avisos efetivamente disparados nesta execução. */
  sent: number
  /** Janelas já avisadas antes (idempotência funcionando). */
  skipped: number
  /** Cobranças cujo email saiu nesta execução (inclui retentativas). */
  emailed: number
  /** Cobranças com email ainda por sair — a próxima execução tenta de novo. */
  emailPending: number
  errors: string[]
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDue(dueDate: Date): string {
  // dueDate é meia-noite UTC do dia civil do vencimento — formatar em UTC evita
  // que o fuso puxe a data para o dia anterior.
  return dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

/** Texto de cada janela. Separado da montagem para ficar fácil de revisar. */
export function reminderCopy(
  offsetDays: number,
  amount: number,
  dueDate: Date,
): { title: string; body: string; level: "INFO" | "WARNING" } {
  const valor = money(amount)
  const venc = formatDue(dueDate)
  if (offsetDays === 0) {
    return {
      level: "WARNING",
      title: `Sua mensalidade vence hoje — ${valor}`,
      body: `A cobrança de ${valor} vence hoje (${venc}). Pague hoje para manter sua unidade ativa e evitar o bloqueio dos seus alunos.`,
    }
  }
  if (offsetDays <= 2) {
    // 1 dia só acontece na retentativa do email (não existe janela D-1).
    const quando = offsetDays === 1 ? "amanhã" : `em ${offsetDays} dias`
    return {
      level: "WARNING",
      title: `Sua mensalidade vence ${quando} — ${valor}`,
      body: `A cobrança de ${valor} vence em ${venc}. Garanta o pagamento para não correr risco de suspensão.`,
    }
  }
  return {
    level: "INFO",
    title: `Sua mensalidade vence em ${offsetDays} dias — ${valor}`,
    body: `A cobrança de ${valor} vence em ${venc}. Você já pode pagar por PIX, boleto ou cartão.`,
  }
}

/**
 * Varre as cobranças em aberto cujo vencimento cai exatamente numa das janelas
 * e dispara o aviso pendente. Idempotente por construção.
 */
export async function runTenantPaymentReminders(
  now: Date = new Date(),
): Promise<ReminderResult> {
  const log = contextLogger()
  const result: ReminderResult = {
    inspected: 0,
    sent: 0,
    skipped: 0,
    emailed: 0,
    emailPending: 0,
    errors: [],
  }

  const today = brDayStartUtc(now)
  // Só os DIAS das janelas entram na consulta — nada de varrer o intervalo
  // inteiro e filtrar em memória. Cada janela vira um intervalo [dia, dia+1)
  // em vez de igualdade exata: hoje todo `dueDate` é meia-noite UTC (vem do
  // "YYYY-MM-DD" do Asaas), mas uma linha gravada com hora não pode sumir do
  // aviso por causa disso.
  const dueDate = {
    OR: REMINDER_OFFSETS.map((offset) => {
      const start = new Date(today.getTime() + offset * MS_PER_DAY)
      return { dueDate: { gte: start, lt: new Date(start.getTime() + MS_PER_DAY) } }
    }),
  }

  const charges = await prisma.tenantPayment.findMany({
    where: { ...dueDate, ...REMINDABLE_CHARGE },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  })

  result.inspected = charges.length

  for (const charge of charges) {
    // Recalcula a janela a partir da própria data (mesma regra da UI) em vez de
    // inferir da ordem da consulta — se a query mudar, o aviso não desalinha.
    const offsetDays = daysUntilBrDay(charge.dueDate, now)
    if (!REMINDER_OFFSETS.includes(offsetDays as (typeof REMINDER_OFFSETS)[number])) {
      continue
    }

    try {
      // Reivindica a janela ANTES de avisar. `skipDuplicates` transforma a
      // corrida em "count === 0" em vez de exceção.
      const claim = await prisma.tenantPaymentReminder.createMany({
        data: [{ tenantPaymentId: charge.id, offsetDays }],
        skipDuplicates: true,
      })
      if (claim.count === 0) {
        result.skipped++
        continue
      }

      const copy = reminderCopy(offsetDays, Number(charge.amount), charge.dueDate)
      await createNotification({
        audience: "TENANT",
        tenantId: charge.tenantId,
        level: copy.level,
        title: copy.title,
        body: copy.body,
        category: "tenant-billing",
        href: "/painel/cobrancas",
        // O email sai na fase seguinte, com resultado conferido e retentativa.
        suppressEmail: true,
      })
      result.sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`cobrança ${charge.id}: ${message}`)
      log.error(
        {
          err: error,
          event: "tenant_payment_reminders.charge_failed",
          tenantPaymentId: charge.id,
          tenantId: charge.tenantId,
          offsetDays,
        },
        "falha ao disparar lembrete de mensalidade",
      )
    }
  }

  await deliverPendingEmails(now, today, result)

  log.info(
    {
      event: "tenant_payment_reminders.done",
      inspected: result.inspected,
      sent: result.sent,
      skipped: result.skipped,
      emailed: result.emailed,
      emailPending: result.emailPending,
      errorCount: result.errors.length,
    },
    "lembretes de mensalidade concluídos",
  )

  return result
}

/**
 * Envia o email de um aviso e registra o resultado em `emailedAt`.
 *
 * Reivindica as linhas ANTES de enviar (duas execuções simultâneas não mandam o
 * mesmo email em dobro) e DEVOLVE a janela se nenhum provedor aceitar — é isso
 * que faz a próxima execução tentar de novo. Usado pelos lembretes de
 * vencimento e pelo aviso final de cancelamento do `overdue-sweep`.
 *
 * `taken`: nada pendente nessas linhas (já saiu, ou outra execução pegou).
 */
export async function deliverReminderEmail(
  rows: { tenantPaymentId: string; offsetDays: number | { gte: number } },
  email: Parameters<typeof sendTenantNotificationEmails>[0],
): Promise<"sent" | "failed" | "taken"> {
  const claimedAt = new Date()
  const claim = await prisma.tenantPaymentReminder.updateMany({
    where: { ...rows, emailedAt: null },
    data: { emailedAt: claimedAt },
  })
  if (claim.count === 0) return "taken"

  let delivered = false
  try {
    delivered = await sendTenantNotificationEmails(email)
  } finally {
    if (!delivered) {
      await prisma.tenantPaymentReminder.updateMany({
        where: { ...rows, emailedAt: claimedAt },
        data: { emailedAt: null },
      })
    }
  }
  return delivered ? "sent" : "failed"
}

/**
 * Entrega o email de todo aviso ainda sem `emailedAt` — os reivindicados agora
 * e os que falharam em execuções anteriores. Falha de envio devolve a linha a
 * pendente, e a próxima execução tenta de novo.
 */
async function deliverPendingEmails(
  now: Date,
  today: Date,
  result: ReminderResult,
): Promise<void> {
  const log = contextLogger()
  const startedAt = Date.now()

  const pending = await prisma.tenantPaymentReminder.findMany({
    where: {
      emailedAt: null,
      // Negativo = aviso final de cancelamento, entregue pelo overdue-sweep.
      offsetDays: { gte: 0 },
      tenantPayment: {
        ...REMINDABLE_CHARGE,
        // Venceu ontem: quem fala com a unidade agora é a régua de inadimplência.
        dueDate: { gte: today },
      },
    },
    // Cobrança com duas janelas pendentes recebe UM email, não dois.
    distinct: ["tenantPaymentId"],
    select: {
      tenantPaymentId: true,
      tenantPayment: { select: { amount: true, dueDate: true, tenantId: true } },
    },
  })

  for (const [index, row] of pending.entries()) {
    if (Date.now() - startedAt > EMAIL_BUDGET_MS) {
      result.emailPending += pending.length - index
      break
    }
    const charge = row.tenantPayment
    try {
      // Texto do DIA, não da janela reivindicada: a retentativa de um aviso de
      // 5 dias que sai no dia seguinte diz "vence em 4 dias".
      const copy = reminderCopy(
        daysUntilBrDay(charge.dueDate, now),
        Number(charge.amount),
        charge.dueDate,
      )
      const outcome = await deliverReminderEmail(
        { tenantPaymentId: row.tenantPaymentId, offsetDays: { gte: 0 } },
        {
          tenantId: charge.tenantId,
          title: copy.title,
          body: copy.body,
          category: "tenant-billing",
          href: "/painel/cobrancas",
        },
      )
      if (outcome === "sent") result.emailed++
      else if (outcome === "failed") result.emailPending++
    } catch (error) {
      result.emailPending++
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`email da cobrança ${row.tenantPaymentId}: ${message}`)
      log.error(
        {
          err: error,
          event: "tenant_payment_reminders.email_failed",
          tenantPaymentId: row.tenantPaymentId,
          tenantId: charge.tenantId,
        },
        "falha ao enviar email do lembrete de mensalidade",
      )
    }
  }
}
