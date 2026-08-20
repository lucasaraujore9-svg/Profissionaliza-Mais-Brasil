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
  city: string
  cityName: string
  state: string
  country: string
  externalReference: string
  notificationDisabled: boolean
  additionalEmails: string | null
  personType: "FISICA" | "JURIDICA"
  deleted: boolean
  foreignCustomer: boolean
  dateCreated: string
}

export interface AsaasCustomerList {
  object: string
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: AsaasCustomer[]
}

// ── Payment Creation ──
export interface AsaasCreatePaymentParams {
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  dueDate: string // YYYY-MM-DD
  description?: string
  externalReference?: string
  notificationUrl?: string
  // Checkout transparente no cartao: quando billingType=CREDIT_CARD, o Asaas
  // captura o cartao na mesma chamada (POST /payments). remoteIp e o IP do
  // COMPRADOR (nao do servidor) — obrigatorio para analise de risco.
  creditCard?: AsaasCreditCard
  creditCardHolderInfo?: AsaasCreditCardHolderInfo
  remoteIp?: string
}

// ── Subscription ──
export interface AsaasCreateSubscriptionParams {
  customer: string
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"
  value: number
  nextDueDate: string
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY"
  description?: string
  externalReference?: string
  endDate?: string // YYYY-MM-DD — fim da subscription (Asaas para cobranças após)
  maxPayments?: number // número exato de cobranças; preferido sobre endDate
  notificationUrl?: string
  // Assinatura no cartao (checkout transparente): tokeniza o cartao e cobra a
  // 1a parcela na criacao. As demais sao recorrentes no mesmo cartao.
  creditCard?: AsaasCreditCard
  creditCardHolderInfo?: AsaasCreditCardHolderInfo
  remoteIp?: string
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

// ── Installment (parcelamento no cartão) ──
// POST /installments/ cria E cobra um parcelamento no cartão de uma só vez.
// Usado para parcelar a PRIMEIRA mensalidade do revendedor.
export interface AsaasCreateInstallmentCardParams {
  installmentCount: number
  customer: string
  /** Valor de CADA parcela. */
  value: number
  /** Valor total (Asaas reconcilia a última parcela com base nele). */
  totalValue?: number
  billingType: "CREDIT_CARD"
  dueDate: string // YYYY-MM-DD — vencimento da 1ª parcela
  description?: string
  /** Vai para externalReference de cada cobrança gerada. */
  paymentExternalReference?: string
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  /** IP do COMPRADOR (não do servidor). Obrigatório no Asaas. */
  remoteIp: string
}

export interface AsaasInstallment {
  id: string
  value: number
  installmentCount: number
  /** Valor de cada parcela. */
  paymentValue: number
  billingType: string
  description: string | null
  transactionReceiptUrl: string | null
  deleted: boolean
}

// ── Installment no BOLETO (carnê) ──
// POST /installments cria um parcelamento em boleto: o Asaas gera todas as N
// cobranças de uma vez, com vencimentos mensais a partir de `dueDate`. Usado
// na venda direta parcelada no boleto (carnê da revenda). Diferente do cartão,
// não captura nada na criação — cada boleto é pago pelo aluno no seu vencimento.
export interface AsaasCreateInstallmentBoletoParams {
  installmentCount: number
  customer: string
  /** Valor de CADA parcela. */
  value: number
  /** Valor total (N × value) — o Asaas reconcilia a última parcela por ele. */
  totalValue?: number
  billingType: "BOLETO"
  dueDate: string // YYYY-MM-DD — vencimento da 1ª parcela; as demais mensais
  description?: string
  /** Vai para externalReference de cada cobrança gerada (traço/roteamento). */
  paymentExternalReference?: string
  notificationUrl?: string
}

// ── Payment ──
export interface AsaasPayment {
  id: string
  customer: string
  subscription: string | null
  /**
   * Id do parcelamento (`ins_...`) quando esta cobranca e uma PARCELA de um
   * carne/parcelamento. Cobrancas avulsas e de assinatura vem com null.
   *
   * E por ele que o webhook reconhece as parcelas 2..N de uma mensalidade
   * parcelada no cartao: elas chegam SEM `subscription` e, sem este campo,
   * caiam no fallback "sem subscription" sem atualizar nada.
   */
  installment: string | null
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
  externalReference: string | null
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

// ── PIX QR Code ──
export interface AsaasPixQrCode {
  encodedImage: string
  payload: string
  expirationDate: string
  description: string
}

// ── Billing Info (Boleto + Card token; PIX vem de /pixQrCode separado) ──
export interface AsaasBillingInfo {
  pix: AsaasPixQrCode | null
  creditCard: {
    creditCardNumber: string
    creditCardBrand: string
    creditCardToken: string
  } | null
  bankSlip: {
    identificationField: string
    nossoNumero: string
    barCode: string
    bankSlipUrl: string
    daysAfterDueDateToRegistrationCancellation: number
  } | null
}

// ── Credit Card Checkout ──
export interface AsaasCreditCard {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export interface AsaasCreditCardHolderInfo {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  addressComplement?: string
  phone: string
  mobilePhone?: string
}

export interface AsaasPayWithCreditCardParams {
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  // IP do COMPRADOR (nao do servidor). O Asaas usa na analise de risco da
  // captura do cartao — sem ele a transacao pode ser recusada. Mesma exigencia
  // de createPayment/createInstallment com cartao.
  remoteIp?: string
}

// ── Webhook ──
export type AsaasWebhookEvent =
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_DELETED"
  | "PAYMENT_RESTORED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_PARTIALLY_REFUNDED"
  | "PAYMENT_REFUND_IN_PROGRESS"
  | "PAYMENT_REFUND_DENIED"
  | "PAYMENT_ANTICIPATED"
  | "PAYMENT_AUTHORIZED"
  | "PAYMENT_AWAITING_RISK_ANALYSIS"
  | "PAYMENT_APPROVED_BY_RISK_ANALYSIS"
  | "PAYMENT_REPROVED_BY_RISK_ANALYSIS"
  | "PAYMENT_RECEIVED_IN_CASH_UNDONE"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
  | "PAYMENT_DUNNING_RECEIVED"
  | "PAYMENT_DUNNING_REQUESTED"
  | "PAYMENT_BANK_SLIP_CANCELLED"
  | "PAYMENT_BANK_SLIP_VIEWED"
  | "PAYMENT_CHECKOUT_VIEWED"
  | "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED"
  | "PAYMENT_SPLIT_CANCELLED"
  | "PAYMENT_SPLIT_DIVERGENCE_BLOCK"
  | "PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_INACTIVATED"
  | "SUBSCRIPTION_DELETED"

export interface AsaasWebhookPayload {
  event: AsaasWebhookEvent
  // Eventos PAYMENT_* trazem `payment`. Eventos SUBSCRIPTION_* trazem
  // `subscription` em vez disso. Modelamos ambos opcionais para suportar
  // os dois fluxos no mesmo handler.
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

// ── Configuração de webhook da CONTA (POST/GET/PUT /v3/webhooks) ──
// O webhook do Asaas é por CONTA, não por cobrança: `notificationUrl` não existe
// no DTO de criação de cobrança/assinatura e é ignorado silenciosamente. É por
// isso que a unidade só recebe callbacks se existir um registro aqui.
export interface AsaasWebhookConfigInput {
  name: string
  url: string
  /** E-mail que o Asaas avisa quando o webhook começa a falhar. */
  email: string
  enabled: boolean
  /** Fila de sincronização interrompida (o Asaas liga isto sozinho após falhas). */
  interrupted: boolean
  apiVersion: 3
  /** Token enviado no header `asaas-access-token`. O Asaas exige 32+ caracteres. */
  authToken: string
  sendType: "SEQUENTIALLY" | "NON_SEQUENTIALLY"
  events: AsaasWebhookEvent[]
}

export interface AsaasWebhookConfig {
  id: string
  name: string
  url: string
  email: string
  enabled: boolean
  interrupted: boolean
  apiVersion: number
  /** O Asaas nunca devolve o token — só informa se existe algum. */
  hasAuthToken: boolean
  sendType: string
  /** Quantidade de entregas penalizadas — sinal de fila em backoff. */
  penalizedRequestsCount: number
  events: AsaasWebhookEvent[]
}

export interface AsaasWebhookConfigList {
  object: string
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: AsaasWebhookConfig[]
}

// ── API Error ──
export interface AsaasErrorResponse {
  errors: Array<{
    code: string
    description: string
  }>
}
