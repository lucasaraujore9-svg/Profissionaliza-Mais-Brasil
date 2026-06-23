import nodemailer, { type Transporter } from "nodemailer"

/**
 * Transporter SMTP para envio de emails.
 *
 * Configurado para Hostinger (smtp.hostinger.com:465 SSL), mas funciona
 * com qualquer provedor SMTP válido — basta setar:
 *
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465                # 465 (SSL) ou 587 (STARTTLS)
 *   SMTP_USER=nao-responda@profissionalizamaisbrasil.com.br
 *   SMTP_PASSWORD=********
 *   SMTP_FROM="Profissionaliza Mais Brasil <nao-responda@profissionalizamaisbrasil.com.br>"
 *
 * Para Hostinger especificamente: o SMTP_USER deve ser o email completo
 * (inclui o domínio) e SMTP_PASSWORD é a senha da caixa de email.
 */

let transporter: Transporter | null = null

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

function loadConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const password = process.env.SMTP_PASSWORD
  const from = process.env.SMTP_FROM ?? user

  const missing = [
    !host && "SMTP_HOST",
    !portRaw && "SMTP_PORT",
    !user && "SMTP_USER",
    !password && "SMTP_PASSWORD",
  ].filter(Boolean) as string[]
  if (missing.length > 0) {
    throw new Error(
      `SMTP não configurado: faltam ${missing.join(", ")}`,
    )
  }

  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`SMTP_PORT inválido: ${portRaw}`)
  }

  return {
    host: host!,
    port,
    // 465 → SSL/TLS direto; outras portas (587, 25) usam STARTTLS via secure=false.
    secure: port === 465,
    user: user!,
    password: password!,
    from: from!,
  }
}

export function getTransporter(): Transporter {
  if (transporter) return transporter
  const cfg = loadConfig()
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    // Timeouts explícitos: sem eles, uma conexão pendurada à Hostinger (porta
    // bloqueada, DNS lento, servidor sem resposta) trava ~muito tempo e falha
    // de forma invisível — em serverless a função pode ser congelada antes de
    // o socket dar erro. Limites curtos transformam o problema num EmailError
    // rápido e auditável (logado + gravado em EmailLog).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Pool com 1 conexão: reaproveita o socket entre envios no mesmo container
    // (Fluid Compute reusa a instância) sem abrir N conexões concorrentes que a
    // Hostinger recusaria. maxMessages recicla o socket periodicamente para não
    // reutilizar uma conexão stale por tempo indefinido.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  })
  return transporter
}

export function getDefaultFrom(): string {
  return loadConfig().from
}

export interface SendSmtpParams {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export async function sendSmtp(
  params: SendSmtpParams,
): Promise<{ messageId: string }> {
  const t = getTransporter()
  const from = params.from ?? getDefaultFrom()
  const info = await t.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  })
  return { messageId: info.messageId }
}
