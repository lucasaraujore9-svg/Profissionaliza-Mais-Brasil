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

export interface MPPayment {
  id: number
  date_created: string
  date_approved: string | null
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
