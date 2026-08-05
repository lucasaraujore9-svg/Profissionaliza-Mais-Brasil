import { NextResponse } from "next/server"

/**
 * Envelope da API de parceiros (/api/v1).
 *
 * Mesmo shape do resto do projeto (`src/lib/api/response.ts`):
 *   sucesso → { ok: true, data: … }
 *   erro    → { ok: false, error: { message, code } }
 *
 * A diferença é que aqui o `code` faz parte do CONTRATO PÚBLICO — o parceiro
 * ramifica no código, não na mensagem. Adicionar código novo é retrocompatível;
 * mudar o significado de um existente não é.
 */

export type ApiErrorCode =
  /** Chave ausente, malformada, desconhecida, revogada ou expirada. */
  | "INVALID_API_KEY"
  /** Chave válida, mas sem o escopo que a rota exige. */
  | "INSUFFICIENT_SCOPE"
  /** Nenhum identificador informado, ou mais de um ao mesmo tempo. */
  | "MISSING_IDENTIFIER"
  /** Identificador informado não tem forma válida (CPF sem dígito, e-mail torto…). */
  | "INVALID_IDENTIFIER"
  /** Nenhuma unidade casou com o identificador. */
  | "NOT_FOUND"
  /** O identificador casou com mais de uma unidade (só ocorre em telefone). */
  | "MULTIPLE_MATCHES"
  /** Excedeu o limite de requisições da chave. */
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true as const, data }, { status })
}

export function apiFail(
  message: string,
  options: { status: number; code: ApiErrorCode; details?: unknown },
): NextResponse {
  const { status, code, details } = options
  return NextResponse.json(
    {
      ok: false as const,
      error: {
        message,
        code,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  )
}
