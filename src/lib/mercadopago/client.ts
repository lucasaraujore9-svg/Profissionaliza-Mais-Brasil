import { decrypt } from "@/lib/crypto"
import type {
  MPCreatePreferenceParams,
  MPPreference,
  MPPayment,
  MPPreapproval,
  MPCreatePreapprovalParams,
  MPAuthorizedPayment,
} from "./types"

const MP_BASE_URL = "https://api.mercadopago.com"
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

export class MPApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "MPApiError"
  }
}

/**
 * Decripta o token MP armazenado no tenant (AES-256-GCM).
 *
 * Tokens MP DEVEM ser persistidos cifrados via `encrypt()` em
 * `src/lib/crypto.ts`. Inserir o token bruto via SQL/Prisma Studio agora
 * causa erro explícito — em produção isso seria um risco de vazamento em
 * caso de leak do banco.
 *
 * Server-side only.
 */
export function decryptTenantMpToken(encrypted: string): string {
  return decrypt(encrypted)
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  method: string,
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const url = `${MP_BASE_URL}${path}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new MPApiError(
          `MP API HTTP ${res.status}: ${res.statusText}`,
          res.status,
          errBody,
        )
      }

      return (await res.json()) as T
    } catch (error) {
      if (error instanceof MPApiError && error.statusCode < 500) throw error

      if (attempt === MAX_RETRIES) {
        if (error instanceof MPApiError) throw error
        throw new MPApiError(
          `Network error after ${MAX_RETRIES + 1} attempts: ${path}`,
          0,
        )
      }

      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      if (process.env.NODE_ENV === "development") {
        console.warn(`[MP] Retry ${attempt + 1}/${MAX_RETRIES} for ${path} in ${backoff}ms`)
      }
      await sleep(backoff)
    }
  }

  throw new MPApiError("Unexpected retry exhaustion", 0)
}

// ── Preferences (Checkout) ──

export async function createPreference(
  accessToken: string,
  params: MPCreatePreferenceParams,
): Promise<MPPreference> {
  return request<MPPreference>("POST", "/checkout/preferences", accessToken, params)
}

// ── Payments ──

export async function getPayment(
  accessToken: string,
  paymentId: string | number,
): Promise<MPPayment> {
  return request<MPPayment>("GET", `/v1/payments/${paymentId}`, accessToken)
}

// ── Preapproval (Subscription) ──

export async function getPreapproval(
  accessToken: string,
  preapprovalId: string,
): Promise<MPPreapproval> {
  return request<MPPreapproval>("GET", `/preapproval/${preapprovalId}`, accessToken)
}

export async function createPreapproval(
  accessToken: string,
  params: MPCreatePreapprovalParams,
): Promise<MPPreapproval> {
  return request<MPPreapproval>("POST", "/preapproval", accessToken, params)
}

export async function getAuthorizedPayment(
  accessToken: string,
  authorizedPaymentId: string,
): Promise<MPAuthorizedPayment> {
  return request<MPAuthorizedPayment>(
    "GET",
    `/authorized_payments/${authorizedPaymentId}`,
    accessToken,
  )
}

export async function searchPayments(
  accessToken: string,
  params: { external_reference?: string; status?: string },
): Promise<{ results: MPPayment[] }> {
  const qs = new URLSearchParams(params as Record<string, string>).toString()
  return request<{ results: MPPayment[] }>("GET", `/v1/payments/search?${qs}`, accessToken)
}

export async function cancelPreapproval(
  accessToken: string,
  preapprovalId: string,
): Promise<MPPreapproval> {
  return request<MPPreapproval>("PUT", `/preapproval/${preapprovalId}`, accessToken, { status: "cancelled" })
}
