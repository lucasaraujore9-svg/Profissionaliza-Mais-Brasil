/**
 * Next.js instrumentation hook (runtime-only).
 *
 * Roda 1x quando o servidor inicia em produção/dev — NÃO durante o
 * `next build`. Lugar correto para validar envs essenciais sem quebrar
 * o build do Vercel (que não tem todas as envs de runtime injetadas).
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register(): Promise<void> {
  // Só roda no Node runtime — Edge runtime do middleware tem outras
  // restrições e não precisa do schema completo.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { assertEnv } = await import("@/lib/env")
  const { logger } = await import("@/lib/logger")
  try {
    assertEnv()
    logger.info({ event: "boot" }, "instrumentation: env válida, app pronto")
  } catch (err) {
    // Em prod: re-lançar derruba o servidor (fail-fast desejado).
    // Em dev: só loga pra não bloquear desenvolvimento local.
    if (process.env.NODE_ENV === "production") {
      logger.fatal({ err, event: "boot.env.invalid" }, "env validation falhou em produção — abortando")
      throw err
    }
    logger.warn({ err, event: "boot.env.invalid" }, "env validation falhou (dev)")
  }
}

/**
 * Hook oficial do Next para erros de servidor NÃO tratados (render/route/action/
 * middleware). Sem isto, uma exceção não-capturada num Server Component ou route
 * handler só ia para o stdout genérico do Next, sem contexto estruturado.
 *
 * OBS-001 (parte interna): aqui damos rastro estruturado (rota, tipo, método) a
 * esses erros. A adoção de um error-tracker dedicado (Sentry/GlitchTip) com
 * release tagging/source maps/dedup é a parte que requer decisão do dono — o
 * ponto de integração seria exatamente este hook (`Sentry.captureRequestError`).
 *
 * NUNCA logamos `request.headers` (cookies/Authorization = PII/segredo). Só
 * caminho/método/rota. No Edge runtime o Pino não roda → usamos console.error
 * com JSON Edge-safe.
 *
 * Assinatura: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: {
    routerKind: string
    routePath: string
    routeType: string
    renderSource?: string
    revalidateReason?: string
  },
): Promise<void> {
  const fields = {
    event: "request.unhandled_error",
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/logger")
    logger.error({ err: error, ...fields }, "erro de servidor não tratado")
    return
  }

  // Edge runtime (middleware/edge routes): Pino não roda. Log JSON Edge-safe,
  // sem PII, alinhado ao padrão de src/proxy.ts / src/lib/redis.ts.
  const err = error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) }
  console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), err, ...fields }))
}
