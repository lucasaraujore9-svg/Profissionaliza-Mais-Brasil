/**
 * Lembretes de vencimento da mensalidade da unidade.
 *
 * Três janelas, definidas em `REMINDER_OFFSETS`: 5 dias antes, 2 dias antes e no
 * dia do vencimento. Cada disparo cria uma notificação in-app para o DONO da
 * unidade (categoria `tenant-billing` é owner-only em `createNotification`) e,
 * pela ponte notificação→email já existente, o mesmo aviso sai por email com a
 * marca da unidade.
 *
 * IDEMPOTÊNCIA: cada (cobrança, janela) é reivindicada em
 * `TenantPaymentReminder` ANTES do disparo. Quem consegue inserir manda o aviso;
 * uma segunda execução no mesmo dia insere zero linhas e não avisa nada. Isso
 * importa porque o pg_net re-tenta, o job pode ser rodado à mão e um deploy no
 * meio da janela reexecuta a rota.
 */
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { brDayStartUtc, daysUntilBrDay } from "@/lib/dates"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { OPEN_STATUSES, REMINDER_OFFSETS } from "./types"

const MS_PER_DAY = 86_400_000

export interface ReminderResult {
  /** Cobranças inspecionadas (em aberto e dentro de alguma janela). */
  inspected: number
  /** Avisos efetivamente disparados nesta execução. */
  sent: number
  /** Janelas já avisadas antes (idempotência funcionando). */
  skipped: number
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
  if (offsetDays === 2) {
    return {
      level: "WARNING",
      title: `Sua mensalidade vence em 2 dias — ${valor}`,
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
  const result: ReminderResult = { inspected: 0, sent: 0, skipped: 0, errors: [] }

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
    where: {
      ...dueDate,
      status: { in: [...OPEN_STATUSES] },
      // Quitada na mão pelo financeiro: não é dívida, não cobra.
      markedPaidAt: null,
      paidAt: null,
      // A PMB não cobra mensalidade de si mesma.
      tenant: { slug: { not: PMB_TENANT_SLUG } },
    },
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

  log.info(
    {
      event: "tenant_payment_reminders.done",
      inspected: result.inspected,
      sent: result.sent,
      skipped: result.skipped,
      errorCount: result.errors.length,
    },
    "lembretes de mensalidade concluídos",
  )

  return result
}
