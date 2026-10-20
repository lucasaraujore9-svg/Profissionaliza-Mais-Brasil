import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { contextLogger } from "@/lib/logger"

/**
 * "Não sou um robô" (reCAPTCHA v2, caixinha) nos checkouts publicos.
 *
 * Complementa o BotID (`bot-guard.ts`): o BotID e invisivel; a caixinha obriga
 * uma acao humana por tentativa de compra. Uma chave so serve para os dominios
 * proprios de todas as unidades porque a "verificacao de origem" fica DESLIGADA
 * no console do Google — e a origem e conferida AQUI: o hostname em que a
 * caixinha foi resolvida tem de ser o host desta requisicao. Sem isso um token
 * resolvido em qualquer site do mundo serviria na nossa loja.
 *
 * Um token so vale uma vez (o Google recusa reuso). Como o envio do formulario
 * faz DUAS chamadas (cadastro + pagamento), o cadastro confere o token e emite
 * um PASSE de uso unico (cookie assinado, 2 min) que o pagamento consome. Nova
 * tentativa de cartao = nova caixinha marcada.
 *
 * Desligado enquanto as duas chaves nao estiverem configuradas (a do site vai
 * no bundle; sem ela o formulario nem desenha a caixinha e recusaria todos).
 */

export type HumanCheckMode =
  /** Cadastro: exige o token e emite o passe para o pagamento seguinte. */
  | "issue"
  /** Pagamento: aceita o passe do cadastro ou um token novo. */
  | "consume"

export const RECAPTCHA_HEADER = "x-recaptcha-token"
const PASS_COOKIE = "pmb_hc"
const PASS_TTL_SEC = 120

export function humanCheckEnabled(): boolean {
  return !!process.env.RECAPTCHA_SECRET_KEY && !!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
}

function passSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.ENCRYPTION_KEY ?? ""
}

function sign(payload: string): string {
  return createHmac("sha256", passSecret()).update(`hc:${payload}`).digest("base64url")
}

export function makePass(now = Date.now()): string {
  const payload = `${randomBytes(12).toString("base64url")}.${now + PASS_TTL_SEC * 1000}`
  return `${payload}.${sign(payload)}`
}

/** Nonce do passe se a assinatura confere e nao expirou; senao `null`. */
export function readPass(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null
  const parts = value.split(".")
  if (parts.length !== 3) return null
  const [nonce, exp, mac] = parts
  const expected = Buffer.from(sign(`${nonce}.${exp}`))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  if (!(Number(exp) > now)) return null
  return nonce
}

/** Uso unico do passe. Sem Redis, aceita (as travas de cartao seguem valendo). */
async function consumePass(nonce: string): Promise<boolean> {
  if (!redis) return true
  try {
    const r = await redis.set(`hc:used:${nonce}`, "1", { nx: true, ex: PASS_TTL_SEC * 2 })
    return r === "OK"
  } catch (err) {
    contextLogger().error({ err, event: "human_check.redis_failed" }, "passe do captcha: Redis falhou — aceitando")
    return true
  }
}

function requestHost(request: Request): string {
  return (request.headers.get("host") ?? "").split(":")[0].toLowerCase()
}

type Verdict = "ok" | "invalid" | "unavailable"

async function verifyToken(token: string, request: Request): Promise<Verdict> {
  const body = new URLSearchParams({
    secret: process.env.RECAPTCHA_SECRET_KEY ?? "",
    response: token,
  })
  const ip = request.headers.get("x-real-ip")
  if (ip) body.set("remoteip", ip)
  let data: { success?: boolean; hostname?: string; "error-codes"?: string[] }
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return "unavailable"
    data = await res.json()
  } catch {
    return "unavailable"
  }
  if (!data.success) {
    contextLogger().warn(
      { event: "human_check.token_rejected", errors: data["error-codes"] ?? [] },
      "captcha recusado pelo Google",
    )
    return "invalid"
  }
  const host = requestHost(request)
  if ((data.hostname ?? "").toLowerCase() !== host) {
    contextLogger().warn(
      { event: "human_check.hostname_mismatch", tokenHost: data.hostname, host },
      "captcha resolvido em outro site",
    )
    return "invalid"
  }
  return "ok"
}

function refuse(code: "CAPTCHA_REQUIRED" | "CAPTCHA_INVALID"): Response {
  return NextResponse.json(
    {
      error:
        code === "CAPTCHA_REQUIRED"
          ? "Marque a caixa \"Não sou um robô\" para continuar."
          : "A verificação \"Não sou um robô\" expirou. Marque a caixa de novo.",
      code,
    },
    { status: 403 },
  )
}

/** Devolve a resposta 403 a retornar, ou `null` para seguir. */
export async function requireHuman(request: Request, mode: HumanCheckMode): Promise<Response | null> {
  if (!humanCheckEnabled()) return null
  const jar = await cookies()

  if (mode === "consume") {
    const nonce = readPass(jar.get(PASS_COOKIE)?.value)
    if (nonce) {
      jar.delete(PASS_COOKIE)
      if (await consumePass(nonce)) return null
    }
  }

  const token = request.headers.get(RECAPTCHA_HEADER)
  if (!token) return refuse("CAPTCHA_REQUIRED")

  const verdict = await verifyToken(token, request)
  if (verdict === "invalid") return refuse("CAPTCHA_INVALID")
  if (verdict === "unavailable") {
    // Google fora: fail-open. BotID, limite por IP e as travas de cartao seguem.
    contextLogger().error({ event: "human_check.unavailable" }, "reCAPTCHA indisponivel — liberando")
  }

  if (mode === "issue") {
    jar.set(PASS_COOKIE, makePass(), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api",
      maxAge: PASS_TTL_SEC,
    })
  }
  return null
}
