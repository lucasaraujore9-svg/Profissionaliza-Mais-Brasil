/**
 * Helpers para tratamento consistente de erros.
 *
 * Por que existem:
 *   Antes havia `.catch(() => undefined)` espalhado em ~40 lugares. Isso
 *   engole erros silenciosamente — quando algo quebra em prod (race
 *   condition, DB indisponível, etc.), não fica vestígio no log e o bug
 *   só aparece quando o usuário reclama.
 *
 *   Os usos eram TODOS intencionais (fire-and-forget de notificação,
 *   cleanup, invalidação de cache). A semântica "não derrubar o request"
 *   é correta — mas precisamos saber QUANDO falham.
 *
 * Migração:
 *   ❌ `.catch(() => undefined)`
 *   ✅ `.catch(swallow("contexto-curto"))`
 */

import { contextLogger } from "@/lib/logger"

/**
 * Cria um catch handler que loga warn e devolve undefined — não propaga.
 * Use APENAS em side-effects não-críticos. Se a operação for crítica
 * (afetar saldo, matrícula, pagamento), propague o erro.
 *
 * @example
 *   await prisma.webhookLog.update({...}).catch(swallow("mp.markLog"))
 */
export function swallow(
  context: string,
): (error: unknown) => undefined {
  return (error: unknown) => {
    contextLogger().warn({ err: error, swallowed: context }, "swallowed error")
    return undefined
  }
}

/**
 * Versão mais explícita para cleanup que normalmente nunca falha mas, se
 * falhar, queremos saber. Igual a `swallow` mas com tag diferente no log
 * pra facilitar filtros em produção.
 */
export function swallowCleanup(
  context: string,
): (error: unknown) => undefined {
  return (error: unknown) => {
    contextLogger().warn({ err: error, cleanup: context }, "cleanup failed")
    return undefined
  }
}
