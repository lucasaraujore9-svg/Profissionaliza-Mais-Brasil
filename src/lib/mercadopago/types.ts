export interface MPPreferenceItem {
  id?: string
  title: string
  description?: string
  quantity: number
  unit_price: number
  currency_id?: "BRL"
  picture_url?: string
}

export interface MPPreferencePayer {
  name?: string
  surname?: string
  email: string
  phone?: { area_code: string; number: string }
  identification?: { type: string; number: string }
}

export interface MPCreatePreferenceParams {
  items: MPPreferenceItem[]
  payer?: MPPreferencePayer
  back_urls?: {
    success?: string
    failure?: string
    pending?: string
  }
  auto_return?: "approved" | "all"
  notification_url?: string
  external_reference?: string
  statement_descriptor?: string
  expires?: boolean
  expiration_date_from?: string
  expiration_date_to?: string
}

export interface MPPreference {
  id: string
  init_point: string
  sandbox_init_point: string
  date_created: string
  external_reference: string
  items: MPPreferenceItem[]
}

/**
 * Identificação do pagador. CPF/CNPJ é exigido pelo MP em pagamentos
 * transparentes (cartão, PIX e boleto).
 */
export interface MPIdentification {
  type: "CPF" | "CNPJ"
  number: string
}

/**
 * Parâmetros do POST /v1/payments — núcleo do Checkout Transparente.
 *
 * - Cartão: exige `token` (gerado client-side pelo SDK do MP), `installments`,
 *   `payment_method_id` e `issuer_id`.
 * - PIX: `payment_method_id: "pix"`, sem token. A resposta traz o QR em
 *   `point_of_interaction.transaction_data`.
 * - Boleto: `payment_method_id: "bolbradesco"` (ou similar), sem token. A
 *   resposta traz a URL/linha digitável em `transaction_details`.
 */
export interface MPCreatePaymentParams {
  transaction_amount: number
  description?: string
  /** Token do cartão tokenizado no browser. Ausente em PIX/boleto. */
  token?: string
  installments?: number
  payment_method_id: string
  issuer_id?: string
  external_reference?: string
  notification_url?: string
  /** Data de expiração (ISO) — usado em PIX/boleto. */
  date_of_expiration?: string
  payer: {
    email: string
    first_name?: string
    last_name?: string
    identification?: MPIdentification
    address?: {
      zip_code?: string
      street_name?: string
      street_number?: string
      neighborhood?: string
      city?: string
      federal_unit?: string
    }
  }
  metadata?: Record<string, unknown>
}

export interface MPPayment {
  id: number
  date_created: string
  date_approved: string | null
  date_of_expiration?: string | null
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back"
  status_detail: string
  payment_method_id: string
  payment_type_id: string
  transaction_amount: number
  net_amount: number
  currency_id: string
  description: string
  external_reference: string | null
  payer: {
    id: string
    email: string
    identification?: { type: string; number: string }
  }
  /** PIX: QR code (copia-e-cola + base64 da imagem) e ticket_url. */
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string
    }
  }
  /** Boleto: PDF/linha digitável. */
  transaction_details?: {
    external_resource_url?: string | null
    digitable_line?: string | null
    verification_code?: string | null
  }
  metadata: Record<string, unknown>
}

export interface MPPreapproval {
  id: string
  status: string
  reason: string
  external_reference: string
  payer_email: string
  auto_recurring: {
    frequency: number
    frequency_type: string
    transaction_amount: number
    currency_id: string
    start_date?: string
    end_date?: string
  }
  init_point?: string
  date_created: string
  next_payment_date: string
}

export interface MPCreatePreapprovalParams {
  reason: string
  external_reference: string
  payer_email: string
  back_url: string
  notification_url?: string
  /**
   * Token do cartão (gerado no browser) para assinatura transparente. Quando
   * presente, o MP cobra o cartão direto e o status nasce "authorized" sem
   * redirect. Ausente = fluxo redirecionado (init_point).
   */
  card_token_id?: string
  auto_recurring: {
    frequency: number
    frequency_type: "days" | "months"
    transaction_amount: number
    currency_id: "BRL"
    start_date?: string
    end_date?: string
  }
  status?: "pending" | "authorized"
}

export interface MPAuthorizedPayment {
  id: number
  preapproval_id: string
  status: string
  external_reference: string
  transaction_amount: number
  currency_id: string
  payment_id: number | null
  date_created: string
  last_modified: string
}

export interface MPWebhookNotification {
  id?: number | string
  type?: string
  action?: string
  data?: { id: string }
  date_created?: string
  user_id?: number | string
  live_mode?: boolean
  api_version?: string
}
