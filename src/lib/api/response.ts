import { NextResponse } from "next/server"
import { ZodError } from "zod"

/**
 * Helpers para respostas de API com shape consistente.
 *
 * Por que existe:
 *   Antes cada rota retornava `{ data }`, `{ error }`, `{ success, data }` etc.
 *   sem padrão. O frontend tinha que parsear cada response de forma diferente.
 *   Esses helpers fixam o contrato — adote em rotas novas.
 *
 * Shape:
 *   - Sucesso: `{ ok: true, data: T }`           (HTTP 2xx)
 *   - Erro:    `{ ok: false, error: { message, code?, details? } }` (HTTP 4xx/5xx)
 *
 * Rotas antigas com shape diferente NÃO precisam ser migradas hoje. Quando
 * encostar nelas, migre. Documentado em docs/SECURITY.md (Convenções).
 */

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: {
    message: string
    code?: string
    details?: unknown
  }
}

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status })
}

export function fail(
  message: string,
  options: { status?: number; code?: string; details?: unknown } = {},
): NextResponse<ApiError> {
  const { status = 400, code, details } = options
  return NextResponse.json(
    {
      ok: false as const,
      error: {
        message,
        ...(code ? { code } : {}),
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  )
}

export const apiResponse = {
  ok,
  fail,
  unauthorized: (message = "Não autenticado") => fail(message, { status: 401, code: "UNAUTHORIZED" }),
  forbidden: (message = "Acesso negado") => fail(message, { status: 403, code: "FORBIDDEN" }),
  notFound: (message = "Recurso não encontrado") => fail(message, { status: 404, code: "NOT_FOUND" }),
  badRequest: (message = "Requisição inválida", details?: unknown) =>
    fail(message, { status: 400, code: "BAD_REQUEST", details }),
  conflict: (message = "Conflito") => fail(message, { status: 409, code: "CONFLICT" }),
  serverError: (message = "Erro interno") => fail(message, { status: 500, code: "INTERNAL_ERROR" }),

  /**
   * Atalho para `error instanceof ZodError`. Devolve 400 com fieldErrors
   * formatados como no resto do app.
   */
  validation(error: ZodError): NextResponse<ApiError> {
    return fail("Dados inválidos", {
      status: 400,
      code: "VALIDATION_ERROR",
      details: error.flatten().fieldErrors,
    })
  },
}
