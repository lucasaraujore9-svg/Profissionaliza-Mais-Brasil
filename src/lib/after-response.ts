import { after } from "next/server"

/**
 * Executa `fn` DEPOIS que a resposta HTTP foi enviada, sem bloquear o handler
 * (webhook responde 200 rápido; emails/efeitos vão em background).
 *
 * Por que não `void fn()` direto: em serverless/Fluid Compute a instância é
 * congelada assim que a resposta sai, matando promises soltas antes de
 * terminarem (ex.: SMTP ~1-2s). `after()` mantém a função viva até o background
 * concluir. Mesmo motivo documentado em `api/auth/forgot-password`.
 *
 * `after()` exige um contexto de request (route handler / server action). Como
 * este helper é usado por libs compartilhadas (fulfill, webhooks) que TAMBÉM
 * podem ser chamadas fora de um request (scripts, testes), caímos para execução
 * inline best-effort se `after()` lançar — `fn` é responsável por tratar seus
 * próprios erros, então engolimos qualquer rejeição aqui.
 */
export function afterResponse(fn: () => Promise<unknown>): void {
  try {
    after(fn)
  } catch {
    void fn().catch(() => {})
  }
}
