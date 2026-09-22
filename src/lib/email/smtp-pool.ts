import nodemailer, { type Transporter } from "nodemailer"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { brDayIso } from "@/lib/dates"
import { contextLogger } from "@/lib/logger"

/**
 * Rodizio de envio entre as caixas SMTP cadastradas em /admin/configuracoes/email.
 *
 * Cada caixa da Hostinger aceita ~100 envios/dia e e BLOQUEADA acima disso — com
 * uma caixa so, um dia movimentado derrubava todo e-mail da rede (inclusive o de
 * acesso ao curso). Aqui cada envio RESERVA uma vaga na caixa menos usada do dia
 * e, se o envio falha, devolve a vaga e tenta a proxima caixa.
 *
 * O contador vive na propria linha (`sentDay` + `sentCount`), incrementado num
 * UPDATE atomico: varias instancias serverless enviando ao mesmo tempo nunca
 * passam do limite, e a virada do dia nao precisa de cron (dia gravado != hoje
 * = contador zerado).
 */

/** Fracao do limite diario que dispara o alerta ao SUPER_ADMIN. */
export const SMTP_ALERT_RATIO = 0.8

/** Nome de exibicao quando o chamador nao manda `from`. */
const DEFAULT_DISPLAY_NAME = "Profissionaliza Mais Brasil"

export interface ReservedAccount {
  id: string
  email: string
  passwordEnc: string
  host: string
  port: number
  dailyLimit: number
  sentCount: number
  alertedDay: string | null
}

/** Dia civil brasileiro de hoje — a chave do contador. */
export function smtpDayKey(now: Date = new Date()): string {
  return brDayIso(now)
}

/** Envios de HOJE de uma caixa (contador de outro dia = 0). */
export function sentToday(
  account: { sentDay: string; sentCount: number },
  today: string = smtpDayKey(),
): number {
  return account.sentDay === today ? account.sentCount : 0
}

/** O envio que acabou de reservar vaga cruzou os 80% e ainda nao alertou hoje? */
export function shouldAlert(
  account: { sentCount: number; dailyLimit: number; alertedDay: string | null },
  today: string,
): boolean {
  if (account.alertedDay === today) return false
  return account.sentCount >= Math.ceil(account.dailyLimit * SMTP_ALERT_RATIO)
}

/**
 * Troca o ENDERECO do remetente pela caixa que vai enviar, preservando o nome
 * de exibicao da unidade ("Loja X <...>"). A Hostinger recusa (e o SPF/DKIM
 * reprova) remetente diferente da caixa autenticada.
 */
export function withSenderAddress(from: string | undefined, email: string): string {
  const display = from?.match(/^\s*"?([^"<]*?)"?\s*</)?.[1]?.trim()
  const name = (display || DEFAULT_DISPLAY_NAME).replace(/["\r\n]/g, " ").trim()
  return `${name} <${email}>`
}

/**
 * Reserva UMA vaga na caixa ativa menos usada hoje, fora de `exclude`. `null` =
 * nenhuma caixa cadastrada/ativa com vaga. `FOR UPDATE SKIP LOCKED` faz dois
 * envios simultaneos pegarem caixas diferentes em vez de fila na mesma linha, e
 * o WHERE e reavaliado sob o lock, entao o limite nunca e ultrapassado.
 */
async function reserve(exclude: string[]): Promise<ReservedAccount | null> {
  const today = smtpDayKey()
  const rows = await prisma.$queryRaw<ReservedAccount[]>`
    UPDATE smtp_accounts
       SET sent_count = CASE WHEN sent_day = ${today} THEN sent_count + 1 ELSE 1 END,
           sent_day = ${today},
           updated_at = now()
     WHERE id = (
       SELECT id FROM smtp_accounts
        WHERE active
          AND NOT (id = ANY(${exclude}::text[]))
          AND (sent_day <> ${today} OR sent_count < daily_limit)
        ORDER BY CASE WHEN sent_day = ${today} THEN sent_count ELSE 0 END, created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, email, password_enc AS "passwordEnc", host, port,
              daily_limit AS "dailyLimit", sent_count AS "sentCount",
              alerted_day AS "alertedDay"`
  return rows[0] ?? null
}

/** Envio falhou: devolve a vaga e registra o erro na caixa (visivel no /admin). */
async function release(id: string, error: string): Promise<void> {
  const today = smtpDayKey()
  await prisma.$executeRaw`
    UPDATE smtp_accounts
       SET sent_count = GREATEST(sent_count - 1, 0),
           last_error = ${error.slice(0, 500)},
           last_error_at = now(),
           updated_at = now()
     WHERE id = ${id} AND sent_day = ${today}`
}

// Um transporter por caixa+senha: trocar a senha no /admin gera outro.
const transporters = new Map<string, Transporter>()

function transporterFor(account: ReservedAccount): Transporter {
  const key = `${account.id}:${account.passwordEnc}`
  let t = transporters.get(key)
  if (!t) {
    t = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.port === 465,
      auth: { user: account.email, pass: decrypt(account.passwordEnc) },
      // Mesmos limites de `smtp.ts`: conexao pendurada vira erro rapido.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    transporters.set(key, t)
  }
  return t
}

/**
 * Alerta de 80%: notificacao in-app + e-mail para cada SUPER_ADMIN, UMA vez por
 * caixa por dia. O CAS em `alertedDay` impede alerta duplicado entre instancias.
 * Import dinamico: `notifications` e `mailer` importam este modulo.
 */
async function alertIfNearLimit(account: ReservedAccount): Promise<void> {
  const today = smtpDayKey()
  if (!shouldAlert(account, today)) return
  const claimed = await prisma.smtpAccount.updateMany({
    where: { id: account.id, OR: [{ alertedDay: null }, { alertedDay: { not: today } }] },
    data: { alertedDay: today },
  })
  if (claimed.count === 0) return

  const title = `Caixa de e-mail em ${Math.round((account.sentCount / account.dailyLimit) * 100)}% do limite diário`
  const body = `${account.email} já enviou ${account.sentCount} de ${account.dailyLimit} e-mails hoje. Ao atingir o limite, os envios passam para as outras caixas; se todas lotarem, e-mails deixam de sair até a virada do dia.`
  const { createNotification } = await import("@/lib/notifications")
  // Sem `category`: alerta operacional que nao pode ser silenciado.
  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "WARNING",
    title,
    body,
    href: "/admin/configuracoes/email",
  })
  const admins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { email: true },
  })
  const to = admins.map((a) => a.email).filter((e): e is string => Boolean(e))
  if (to.length === 0) return
  const { sendEmail } = await import("./mailer")
  const { appUrl } = await import("@/lib/tenant/urls")
  await sendEmail({
    to,
    subject: title,
    template: {
      type: "notification",
      props: {
        title,
        body,
        ctaUrl: `${appUrl()}/admin/configuracoes/email`,
        ctaLabel: "Ver caixas de e-mail",
      },
    },
  })
}

/** Existe ao menos uma caixa cadastrada e ativa? */
export async function hasActiveSmtpAccounts(): Promise<boolean> {
  try {
    return (await prisma.smtpAccount.count({ where: { active: true } })) > 0
  } catch {
    return false
  }
}

/**
 * Envia pela caixa menos usada; se ela falhar, tenta a proxima. Devolve `null`
 * quando NENHUMA caixa tinha vaga (o chamador cai no SMTP das variaveis de
 * ambiente). Lanca o ultimo erro quando todas as tentadas falharam.
 */
export async function sendViaSmtpPool(params: {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}): Promise<{ messageId: string; account: string } | null> {
  const tried: string[] = []
  let lastError: unknown = null
  for (;;) {
    // Falha do BANCO na reserva (ex.: migration ainda nao aplicada) nao pode
    // virar apagao de e-mail: sem caixa reservada, cai no SMTP das variaveis.
    const account = await reserve(tried).catch((err) => {
      contextLogger().error({ err, event: "email.smtp_pool.reserve_failed" }, "reserva de caixa SMTP falhou")
      return null
    })
    if (!account) {
      if (lastError) throw lastError
      return null
    }
    tried.push(account.id)
    try {
      const info = await transporterFor(account).sendMail({
        from: withSenderAddress(params.from, account.email),
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      })
      await alertIfNearLimit(account).catch((err) =>
        contextLogger().warn({ err, event: "email.smtp_pool.alert_failed" }, "alerta de 80% falhou"),
      )
      return { messageId: info.messageId, account: account.email }
    } catch (err) {
      lastError = err
      // Destinatario recusado nao e problema da caixa: outra caixa receberia a
      // mesma recusa e gastaria vaga de todas.
      const recipientRefused = (err as { code?: unknown })?.code === "EENVELOPE"
      const message = err instanceof Error ? err.message : String(err)
      await release(account.id, message).catch(() => {})
      contextLogger().warn(
        { err, event: "email.smtp_pool.account_failed", account: account.email },
        "caixa SMTP falhou — tentando a proxima",
      )
      if (recipientRefused) throw err
    }
  }
}

/** Linha da tela /admin/configuracoes/email — nunca carrega a senha. */
export interface SmtpAccountView {
  id: string
  email: string
  host: string
  port: number
  dailyLimit: number
  active: boolean
  sentToday: number
  lastError: string | null
  lastErrorAt: string | null
}

export async function listSmtpAccountsForAdmin(): Promise<SmtpAccountView[]> {
  const today = smtpDayKey()
  const rows = await prisma.smtpAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      host: true,
      port: true,
      dailyLimit: true,
      active: true,
      sentDay: true,
      sentCount: true,
      lastError: true,
      lastErrorAt: true,
    },
  })
  return rows.map(({ sentDay, sentCount, lastErrorAt, ...r }) => ({
    ...r,
    sentToday: sentToday({ sentDay, sentCount }, today),
    lastErrorAt: lastErrorAt?.toISOString() ?? null,
  }))
}
