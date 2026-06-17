import type {
  AsaasCreateCustomerParams,
  AsaasCustomer,
  AsaasCustomerList,
  AsaasCreateSubscriptionParams,
  AsaasCreatePaymentParams,
  AsaasSubscription,
  AsaasPayment,
  AsaasPaymentList,
  AsaasBillingInfo,
  AsaasPixQrCode,
  AsaasPayWithCreditCardParams,
  AsaasCreateInstallmentCardParams,
  AsaasInstallment,
  AsaasErrorResponse,
} from "./types"
import { contextLogger } from "@/lib/logger"
import { decrypt } from "@/lib/crypto"

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

export class AsaasApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors: AsaasErrorResponse["errors"] = [],
  ) {
    super(message)
    this.name = "AsaasApiError"
  }
}

function getConfig(apiKeyOverride?: string) {
  const rawUrl = process.env.ASAAS_API_URL
  // apiKeyOverride: chave da conta Asaas de UMA unidade (revendedor recebendo
  // dos alunos pela conta dele). Sem override = chave global da PMB (mensalidade
  // dos revendedores + vitrine PMB). A base URL (prod vs sandbox) e a mesma para
  // todas as contas — so a chave muda.
  const apiKey = apiKeyOverride ?? process.env.ASAAS_API_KEY
  if (!rawUrl || !apiKey) {
    throw new Error("ASAAS_API_URL and ASAAS_API_KEY environment variables are required")
  }
  let apiUrl = rawUrl.replace(/\/$/, "")
  // A API do Asaas vive sob /v3 (prod: api.asaas.com/v3; sandbox:
  // sandbox.asaas.com/api/v3). Se o ASAAS_API_URL for configurado sem o sufixo
  // /v3 (ex.: "https://api.asaas.com"), TODA chamada cai em 404 e o checkout
  // inteiro quebra. Normalizamos aqui para tolerar essa configuração incompleta.
  if (!/\/v3$/.test(apiUrl)) {
    apiUrl = `${apiUrl}/v3`
  }
  return { apiUrl, apiKey }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  apiKeyOverride?: string,
): Promise<T> {
  const { apiUrl, apiKey } = getConfig(apiKeyOverride)
  const url = `${apiUrl}${path}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Timeout 20s por tentativa. Sem isso, uma chamada lenta pendura
      // a rota inteira até o maxDuration da Vercel (drena Active CPU).
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          access_token: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as AsaasErrorResponse | null
        const msg = errorData?.errors?.[0]?.description ?? `HTTP ${res.status}`
        // Diagnóstico: registra a chamada Asaas que falhou (método, path, status,
        // base URL em runtime e corpo do erro). Sem isso os catches das rotas
        // devolvem 502 sem deixar rastro da causa nos logs da Vercel. `apiUrl`
        // é só o host base (sem token) — seguro logar; revela inclusive se o
        // ambiente está apontando para sandbox vs produção.
        contextLogger().error(
          {
            event: "asaas.client.http_error",
            method,
            path,
            status: res.status,
            baseUrl: apiUrl,
            errors: errorData?.errors ?? null,
          },
          "Asaas API respondeu erro",
        )
        throw new AsaasApiError(msg, res.status, errorData?.errors ?? [])
      }

      return (await res.json()) as T
    } catch (error) {
      if (error instanceof AsaasApiError && error.statusCode < 500) {
        throw error
      }

      if (attempt === MAX_RETRIES) {
        if (error instanceof AsaasApiError) throw error
        throw new AsaasApiError(
          `Network error after ${MAX_RETRIES + 1} attempts: ${path}`,
          0,
        )
      }

      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      if (process.env.NODE_ENV === "development") {
        contextLogger().warn(
          { event: "asaas.client.retry", path, attempt: attempt + 1, maxRetries: MAX_RETRIES, backoffMs: backoff },
          "Asaas retry",
        )
      }
      await sleep(backoff)
    }
  }

  throw new AsaasApiError("Unexpected retry exhaustion", 0)
}

// ── Customers ──

function sanitizeDoc(value: string): string {
  return value.replace(/\D/g, "")
}

function sanitizePhone(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.replace(/\D/g, "")
}

export async function createCustomer(
  params: AsaasCreateCustomerParams,
  apiKey?: string,
): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("POST", "/customers", {
    ...params,
    cpfCnpj: sanitizeDoc(params.cpfCnpj),
    phone: sanitizePhone(params.phone),
    mobilePhone: sanitizePhone(params.mobilePhone),
    // Desabilita as notificações nativas do Asaas (email/SMS de cobrança) para
    // TODOS os clientes criados — tanto no sistema mãe (PMB) quanto nas contas
    // Asaas das unidades. Forçado após o spread para que nenhum caller reative
    // por engano. A comunicação de cobrança é responsabilidade da plataforma.
    notificationDisabled: true,
  }, apiKey)
}

export async function getCustomer(
  customerId: string,
  apiKey?: string,
): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("GET", `/customers/${customerId}`, undefined, apiKey)
}

export async function listCustomers(params?: {
  email?: string
  cpfCnpj?: string
  externalReference?: string
  offset?: number
  limit?: number
}, apiKey?: string): Promise<AsaasCustomerList> {
  const query = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value))
    }
  }
  const qs = query.toString()
  return request<AsaasCustomerList>("GET", `/customers${qs ? `?${qs}` : ""}`, undefined, apiKey)
}

export async function findOrCreateAsaasCustomer(
  params: AsaasCreateCustomerParams,
  apiKey?: string,
): Promise<{ customer: AsaasCustomer; created: boolean }> {
  const cpfCnpj = sanitizeDoc(params.cpfCnpj)
  const existing = await listCustomers({ cpfCnpj, limit: 1 }, apiKey)
  if (existing.data.length > 0) {
    return { customer: existing.data[0], created: false }
  }
  const customer = await createCustomer(params, apiKey)
  return { customer, created: true }
}

// ── Subscriptions ──

export async function createSubscription(
  params: AsaasCreateSubscriptionParams,
  apiKey?: string,
): Promise<AsaasSubscription> {
  // Assinatura COM cartao inline usa um endpoint distinto do Asaas, com BARRA
  // FINAL: POST /v3/subscriptions/ (SubscriptionSaveWithCreditCardRequestDTO,
  // exige creditCard+creditCardHolderInfo+remoteIp). Sem cartao e o padrao
  // POST /v3/subscriptions (sem barra). Postar o cartao no endpoint sem barra
  // faz o Asaas ignorar os campos do cartao (assinatura sem cartao na fatura).
  // Mesma convencao de createInstallmentWithCreditCard (-> "/installments/").
  const path = params.creditCard ? "/subscriptions/" : "/subscriptions"
  return request<AsaasSubscription>("POST", path, params, apiKey)
}

export async function getSubscription(
  subscriptionId: string,
): Promise<AsaasSubscription> {
  return request<AsaasSubscription>("GET", `/subscriptions/${subscriptionId}`)
}

export async function cancelSubscription(
  subscriptionId: string,
): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(
    "DELETE",
    `/subscriptions/${subscriptionId}`,
  )
}

// PUT /v3/subscriptions/{id} — spec oficial não inclui "value".
// Para alterar o valor da assinatura é necessário cancelar e recriar.
export interface AsaasUpdateSubscriptionParams {
  nextDueDate?: string // YYYY-MM-DD
  description?: string
  billingType?: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  status?: "ACTIVE" | "INACTIVE"
  updatePendingPayments?: boolean
}

export async function updateSubscription(
  subscriptionId: string,
  params: AsaasUpdateSubscriptionParams,
): Promise<AsaasSubscription> {
  return request<AsaasSubscription>(
    "PUT",
    `/subscriptions/${subscriptionId}`,
    params,
  )
}

// ── Payments ──

export async function createPayment(
  params: AsaasCreatePaymentParams,
  apiKey?: string,
): Promise<AsaasPayment> {
  // Cobranca COM cartao inline (captura na criacao) usa o endpoint com BARRA
  // FINAL: POST /v3/payments/ (PaymentSaveWithCreditCardRequestDTO, exige
  // remoteIp). Sem cartao e o padrao POST /v3/payments (sem barra) — PIX/boleto
  // e o fluxo do PMB (UNDEFINED). Explicitar o path evita depender de
  // normalizacao de barra do Asaas e espelha a convencao do "/installments/".
  const path = params.creditCard ? "/payments/" : "/payments"
  return request<AsaasPayment>("POST", path, params, apiKey)
}

export async function getPayment(
  paymentId: string,
  apiKey?: string,
): Promise<AsaasPayment> {
  return request<AsaasPayment>("GET", `/payments/${paymentId}`, undefined, apiKey)
}

export async function deletePayment(
  paymentId: string,
): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(
    "DELETE",
    `/payments/${paymentId}`,
  )
}

/**
 * Estorna um pagamento confirmado no Asaas (CDC art. 49 / cancelamento
 * voluntário). Asaas só aceita refund em pagamentos `RECEIVED` ou
 * `CONFIRMED`. Para `PENDING`/`AWAITING_RISK_ANALYSIS`, use deletePayment.
 *
 * https://docs.asaas.com/reference/estornar-cobranca
 */
export async function refundPayment(
  paymentId: string,
  options?: { value?: number; description?: string },
): Promise<AsaasPayment> {
  return request<AsaasPayment>(
    "POST",
    `/payments/${paymentId}/refund`,
    options ?? {},
  )
}

export interface AsaasUpdatePaymentParams {
  dueDate?: string   // YYYY-MM-DD
  value?: number
  description?: string
}

export async function updatePayment(
  paymentId: string,
  params: AsaasUpdatePaymentParams,
): Promise<AsaasPayment> {
  return request<AsaasPayment>("PUT", `/payments/${paymentId}`, params)
}

export async function getBillingInfo(paymentId: string, apiKey?: string): Promise<AsaasBillingInfo> {
  return request<AsaasBillingInfo>("GET", `/payments/${paymentId}/billingInfo`, undefined, apiKey)
}

export async function getPixQrCode(paymentId: string, apiKey?: string): Promise<AsaasPixQrCode> {
  return request<AsaasPixQrCode>("GET", `/payments/${paymentId}/pixQrCode`, undefined, apiKey)
}

export async function payWithCreditCard(
  paymentId: string,
  params: AsaasPayWithCreditCardParams,
): Promise<AsaasPayment> {
  return request<AsaasPayment>("POST", `/payments/${paymentId}/payWithCreditCard`, params)
}

/**
 * Cria e cobra um parcelamento no cartão de crédito (POST /installments/).
 * Diferente de payWithCreditCard, este endpoint divide o valor em N parcelas
 * no cartão numa única chamada. Usado para parcelar a 1ª mensalidade do
 * revendedor. ATENÇÃO: 200 significa que o parcelamento foi CRIADO, não que o
 * cartão foi capturado — a 1ª parcela pode ficar em AWAITING_RISK_ANALYSIS.
 * Confirme o status real via getInstallmentPayments antes de ativar a revenda.
 */
export async function createInstallmentWithCreditCard(
  params: AsaasCreateInstallmentCardParams,
): Promise<AsaasInstallment> {
  return request<AsaasInstallment>("POST", "/installments/", params)
}

/**
 * Lista as cobranças geradas por um parcelamento (GET /installments/{id}/payments).
 * A resposta de createInstallmentWithCreditCard não traz o status da captura;
 * para confirmar se o cartão foi de fato aprovado é preciso consultar a 1ª
 * parcela aqui (status CONFIRMED/RECEIVED = capturado; AWAITING_RISK_ANALYSIS =
 * em análise; PENDING/OVERDUE = não capturado).
 */
export async function getInstallmentPayments(
  installmentId: string,
): Promise<AsaasPaymentList> {
  return request<AsaasPaymentList>("GET", `/installments/${installmentId}/payments`)
}

export async function listPayments(
  params?: {
    customer?: string
    subscription?: string
    status?: string
    offset?: number
    limit?: number
  },
  apiKey?: string,
): Promise<AsaasPaymentList> {
  const query = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value))
    }
  }
  const qs = query.toString()
  return request<AsaasPaymentList>("GET", `/payments${qs ? `?${qs}` : ""}`, undefined, apiKey)
}

/**
 * Descriptografa a API key Asaas de uma unidade (revendedor). Espelha
 * `decryptTenantMpToken` do client do MP. Server-side only. NUNCA armazene a
 * chave em claro: `decrypt()` lanca se o valor nao passou por `encrypt()`.
 */
export function decryptTenantAsaasKey(encrypted: string): string {
  return decrypt(encrypted)
}
