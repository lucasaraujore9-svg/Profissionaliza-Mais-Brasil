export class EAApiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly statusCode?: number,
    public readonly apiError?: string,
  ) {
    super(message)
    this.name = "EAApiError"
  }
}

export class EANetworkError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "EANetworkError"
  }
}
