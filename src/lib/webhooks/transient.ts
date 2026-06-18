import { Prisma } from "@prisma/client"
import { MPApiError } from "@/lib/mercadopago/client"
import { AsaasApiError } from "@/lib/asaas/client"
import { EAApiError, EANetworkError } from "@/lib/plataforma-cursos/errors"

/**
 * Códigos Prisma que indicam falha TRANSITÓRIA de infraestrutura (vale retry):
 * conflito de transação/deadlock, conexão indisponível, timeout.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  "P2034", // transaction conflict / write conflict / deadlock
  "P1001", // can't reach database server
  "P1002", // database server timeout
  "P1008", // operations timed out
  "P1017", // server has closed the connection
])

/**
 * Classifica se um erro lançado durante o processamento de um webhook é
 * TRANSITÓRIO — i.e., uma reentrega do gateway (MP/Asaas) tem chance real de
 * suceder. Erros terminais (4xx de negócio, dado inválido, config permanente)
 * retornam false: reprocessar não ajuda e só geraria retry/ruído infinito.
 *
 * Usado para o processador de webhook decidir entre RELANÇAR (→ a rota responde
 * 500 → o gateway reentrega; fulfillment é idempotente) ou engolir o erro
 * (markLog(false) + visibilidade no WebhookLog + reconciliação manual).
 */
export function isTransientWebhookError(error: unknown): boolean {
  // Gateways: 5xx (instabilidade do provedor) ou statusCode 0 (erro de rede).
  if (error instanceof MPApiError) {
    return error.statusCode >= 500 || error.statusCode === 0
  }
  if (error instanceof AsaasApiError) {
    return error.statusCode >= 500 || error.statusCode === 0
  }
  // Plataforma parceira: 5xx ou sem status (rede) = transitório; 4xx = permanente
  // (curso inexistente, payload inválido) → reprocessar não resolve.
  if (error instanceof EAApiError) {
    return error.statusCode == null || error.statusCode >= 500
  }
  if (error instanceof EANetworkError) return true
  // Banco: conflito de transação/conexão/timeout são transitórios.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(error.code)
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true
  }
  return false
}
