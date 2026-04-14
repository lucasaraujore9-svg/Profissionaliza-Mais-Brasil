import type {
  AsaasCreateCustomerParams,
  AsaasCustomer,
  AsaasCreateSubscriptionParams,
  AsaasSubscription,
  AsaasPayment,
  AsaasPaymentList,
  AsaasErrorResponse,
} from "./types"

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

function getConfig() {
  const apiUrl = process.env.ASAAS_API_URL
  const apiKey = process.env.ASAAS_API_KEY
  if (!apiUrl || !apiKey) {
    throw new Error("ASAAS_API_URL and ASAAS_API_KEY environment variables are required")
  }
  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { apiUrl, apiKey } = getConfig()
  const url = `${apiUrl}${path}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          access_token: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as AsaasErrorResponse | null
        const msg = errorData?.errors?.[0]?.description ?? `HTTP ${res.status}`
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
        console.warn(`[Asaas] Retry ${attempt + 1}/${MAX_RETRIES} for ${path} in ${backoff}ms`)
      }
      await sleep(backoff)
    }
  }

  throw new AsaasApiError("Unexpected retry exhaustion", 0)
}

// ── Customers ──

export async function createCustomer(
  params: AsaasCreateCustomerParams,
): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("POST", "/customers", params)
}

export async function getCustomer(
  customerId: string,
): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("GET", `/customers/${customerId}`)
}

// ── Subscriptions ──

export async function createSubscription(
  params: AsaasCreateSubscriptionParams,
): Promise<AsaasSubscription> {
  return request<AsaasSubscription>("POST", "/subscriptions", params)
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

// ── Payments ──

export async function getPayment(
  paymentId: string,
): Promise<AsaasPayment> {
  return request<AsaasPayment>("GET", `/payments/${paymentId}`)
}

export async function listPayments(
  params?: {
    customer?: string
    subscription?: string
    status?: string
    offset?: number
    limit?: number
  },
): Promise<AsaasPaymentList> {
  const query = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value))
    }
  }
  const qs = query.toString()
  return request<AsaasPaymentList>("GET", `/payments${qs ? `?${qs}` : ""}`)
}
