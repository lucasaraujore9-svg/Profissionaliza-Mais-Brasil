import { decrypt } from "@/lib/crypto"
import type {
  MPCreatePreferenceParams,
  MPPreference,
  MPPayment,
  MPCreatePaymentParams,
  MPPreapproval,
  MPCreatePreapprovalParams,
  MPAuthorizedPayment,
} from "./types"
import { contextLogger } from "@/lib/logger"

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
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${MP_BASE_URL}${path}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Timeout 20s por tentativa. MP costuma responder em <2s; teto
      // evita pendurar rota se a API estiver degradada.
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...extraHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
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
        contextLogger().warn(
          { event: "mp.client.retry", path, attempt: attempt + 1, maxRetries: MAX_RETRIES, backoffMs: backoff },
          "MP retry",
        )
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

// ── Payments (Checkout Transparente) ──

/**
 * Cria um pagamento direto via POST /v1/payments — coração do Checkout
 * Transparente. Aceita cartão (com `token` tokenizado no browser), PIX e
 * boleto (`payment_method_id` sem token).
 *
 * `idempotencyKey` (header X-Idempotency-Key) protege contra cobrança dupla
 * em retry de rede / clique duplo — o MP devolve o MESMO pagamento se a chave
 * já foi usada. Use sempre um valor estável por tentativa de checkout (ex.:
 * o id da enrollment).
 *
 * https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 */
export async function createPayment(
  accessToken: string,
  params: MPCreatePaymentParams,
  idempotencyKey: string,
): Promise<MPPayment> {
  return request<MPPayment>("POST", "/v1/payments", accessToken, params, {
    "X-Idempotency-Key": idempotencyKey,
  })
}

export async function getPayment(
  accessToken: string,
  paymentId: string | number,
): Promise<MPPayment> {
  return request<MPPayment>("GET", `/v1/payments/${paymentId}`, accessToken)
}

/** Um payer_cost do endpoint /v1/payment_methods/installments. */
export interface MPInstallmentPayerCost {
  installments: number
  installment_rate: number
  installment_amount: number
  total_amount: number
  recommended_message?: string
}

interface MPInstallmentsMethod {
  payment_method_id: string
  payment_type_id: string
  payer_costs: MPInstallmentPayerCost[]
}

/**
 * Consulta as parcelas reais do cartão no MP (fonte da verdade do que será
 * cobrado): valor de cada parcela, com/sem juros, conforme a conta da unidade.
 * Filtra por `credit_card` e devolve os payer_costs do BIN/valor informados.
 */
export async function getCardInstallments(
  accessToken: string,
  params: { amount: number; bin: string },
): Promise<MPInstallmentPayerCost[]> {
  const qs = new URLSearchParams({
    amount: String(params.amount),
    bin: params.bin,
    payment_type_id: "credit_card",
  })
  const methods = await request<MPInstallmentsMethod[]>(
    "GET",
    `/v1/payment_methods/installments?${qs.toString()}`,
    accessToken,
  )
  const credit = methods.find((m) => m.payment_type_id === "credit_card") ?? methods[0]
  return credit?.payer_costs ?? []
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

export interface MPRefund {
  id: number
  payment_id: number
  amount: number
  status: string
  date_created: string
}

/**
 * Estorna um pagamento confirmado no Mercado Pago (CDC art. 49 / cancelamento
 * voluntário). Refund total quando `amount` não é passado; parcial caso
 * contrário. Para PIX/Boleto não-pago use cancelPayment (não implementado).
 *
 * https://www.mercadopago.com.br/developers/pt/reference/chargebacks/_payments_id_refunds/post
 */
export async function refundPayment(
  accessToken: string,
  paymentId: string,
  amount?: number,
): Promise<MPRefund> {
  const body = amount !== undefined ? { amount } : {}
  return request<MPRefund>(
    "POST",
    `/v1/payments/${paymentId}/refunds`,
    accessToken,
    body,
  )
}
