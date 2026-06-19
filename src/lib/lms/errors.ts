/** Erro de nivel de API do LMS (HTTP nao-2xx ou corpo { error }). */
export class LmsApiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly statusCode?: number,
    public readonly apiError?: string,
  ) {
    super(message)
    this.name = "LmsApiError"
  }
}

/** Falha de rede/timeout apos esgotar as tentativas. */
export class LmsNetworkError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "LmsNetworkError"
  }
}
