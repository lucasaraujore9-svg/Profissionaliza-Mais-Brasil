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
  try {
    assertEnv()
  } catch (err) {
    // Em prod: re-lançar derruba o servidor (fail-fast desejado).
    // Em dev: só loga pra não bloquear desenvolvimento local.
    if (process.env.NODE_ENV === "production") throw err
    console.error("[instrumentation] env validation:", err)
  }
}
