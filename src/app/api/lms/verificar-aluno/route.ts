import { NextResponse } from "next/server"
import { compare } from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { validateLmsWebhookSignature } from "@/lib/webhooks/lms-webhook"
import { rateLimitByKey, RATE_LIMITS } from "@/lib/ratelimit"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
})

/**
 * Login DIRETO na plataforma de aulas (LMS -> PMB, M2M).
 *
 * O aluno nao tem senha propria no LMS: ela e gerada la na 1a matricula e
 * ninguem a recebe. Quem cai na tela de login de la (atalho salvo, app
 * instalado, sessao encerrada) digita a senha do PMB e tomava "E-mail ou senha
 * incorretos". O LMS pergunta aqui se o par bate e abre a sessao ele mesmo.
 *
 * Mesma regra do login do PMB: so aluno com senha, fora de BLOQUEADO/INATIVO.
 * O e-mail pode existir em varias unidades; devolve TODAS as contas cuja senha
 * confere (o LMS casa pelo externalId = nosso Student.id).
 *
 * Auth: HMAC do webhook do LMS (`PMB_WEBHOOK_SECRET`, `"<ts>.<rawBody>"`).
 * Nunca devolve dado alem dos ids.
 */
export async function POST(request: Request) {
  const secret = env.PMB_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Não configurado." }, { status: 503 })

  const rawBody = await request.text()
  if (
    !validateLmsWebhookSignature(
      request.headers.get("x-pmb-timestamp"),
      rawBody,
      request.headers.get("x-pmb-signature"),
      secret,
    )
  ) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  const { email, password } = parsed.data

  // Por e-mail, nao por IP: todas as chamadas saem do mesmo servidor do LMS.
  const rl = await rateLimitByKey(`lms:${email}`, RATE_LIMITS.authLogin)
  if (!rl.ok) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 })

  const rows = await prisma.student.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      passwordHash: { not: null },
      status: { notIn: ["BLOQUEADO", "INATIVO"] },
    },
    select: { id: true, passwordHash: true },
  })
  const studentExternalIds: string[] = []
  for (const r of rows) {
    if (r.passwordHash && (await compare(password, r.passwordHash))) studentExternalIds.push(r.id)
  }
  return NextResponse.json({ studentExternalIds })
}
