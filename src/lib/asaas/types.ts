// ── Customer ──
export interface AsaasCreateCustomerParams {
  name: string
  email?: string
  phone?: string
  mobilePhone?: string
  cpfCnpj: string
  postalCode?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  externalReference?: string
  notificationDisabled?: boolean
}

export interface AsaasCustomer {
  id: string
  name: string
  email: string
  phone: string
  mobilePhone: string
  cpfCnpj: string
  postalCode: string
  address: string
  addressNumber: string
  complement: string
  province: string
  externalReference: string
  notificationDisabled: boolean
  dateCreated: string
}

// ── Payment Creation ──
export interface AsaasCreatePaymentParams {
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  dueDate: string // YYYY-MM-DD
  description?: string
  externalReference?: string
}

// ── Subscription ──
export interface AsaasCreateSubscriptionParams {
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  nextDueDate: string
  cycle: "MONTHLY" | "WEEKLY" | "BIWEEKLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY"
  description?: string
  externalReference?: string
  endDate?: string // YYYY-MM-DD — fim da subscription (Asaas para cobranças após)
}

export interface AsaasSubscription {
  id: string
  customer: string
  billingType: string
  value: number
  nextDueDate: string
  cycle: string
  description: string
  status: string
  externalReference: string
  dateCreated: string
}

// ── Payment ──
export interface AsaasPayment {
  id: string
  customer: string
  subscription: string | null
  billingType: string
  value: number
  netValue: number
  status: string
  dueDate: string
  paymentDate: string | null
  clientPaymentDate: string | null
  invoiceUrl: string
  bankSlipUrl: string | null
  transactionReceiptUrl: string | null
  externalReference: string
  description: string
  dateCreated: string
}

export interface AsaasPaymentList {
  object: string
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: AsaasPayment[]
}

// ── Webhook ──
export type AsaasWebhookEvent =
  | "PAYMENT_RECEIVED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_DELETED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"

export interface AsaasWebhookPayload {
  event: AsaasWebhookEvent
  payment: AsaasPayment
}

// ── API Error ──
export interface AsaasErrorResponse {
  errors: Array<{
    code: string
    description: string
  }>
}
