"use client"

/**
 * Loader do SDK JS v2 do Mercado Pago (browser) para o Checkout Transparente
 * com campos próprios — em vez do Payment Brick / Secure Fields.
 *
 * Por que o SDK vanilla e não o @mercadopago/sdk-react: o `createCardToken` do
 * pacote React usa Secure Fields (iframes hospedados do MP). Nós queremos os
 * mesmos campos da tela do sistema mãe (inputs próprios), então usamos
 * `new MercadoPago(publicKey).createCardToken({ ...dados crus })`, que tokeniza
 * o cartão no browser (o PAN nunca toca o nosso servidor) e devolve só o token.
 */

export interface MpCardTokenData {
  cardNumber: string
  cardholderName: string
  cardExpirationMonth: string
  cardExpirationYear: string
  securityCode: string
  identificationType: string
  identificationNumber: string
}

export interface MpPaymentMethod {
  id: string
  payment_type_id: string
  issuer?: { id?: number | string }
}

/** Uma opcao de parcelamento devolvida pelo `getInstallments` do SDK. */
export interface MpSdkPayerCost {
  installments: number
  installment_rate: number
  installment_amount: number
  total_amount: number
  recommended_message?: string
}

export interface MpInstallmentsResult {
  payment_method_id: string
  payment_type_id: string
  payer_costs: MpSdkPayerCost[]
}

export interface MercadoPagoInstance {
  createCardToken(data: MpCardTokenData): Promise<{ id: string }>
  getPaymentMethods(params: { bin: string }): Promise<{ results: MpPaymentMethod[] }>
  getInstallments(params: {
    amount: string
    bin: string
    paymentTypeId?: string
  }): Promise<MpInstallmentsResult[]>
}

interface MercadoPagoCtor {
  new (publicKey: string, options?: { locale?: string }): MercadoPagoInstance
}

declare global {
  interface Window {
    MercadoPago?: MercadoPagoCtor
  }
}

const SDK_URL = "https://sdk.mercadopago.com/js/v2"

let scriptPromise: Promise<void> | null = null
const instances = new Map<string, MercadoPagoInstance>()

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("SDK do Mercado Pago só carrega no browser"))
      return
    }
    if (window.MercadoPago) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    )
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () =>
        reject(new Error("Falha ao carregar o SDK do Mercado Pago")),
      )
      return
    }
    const script = document.createElement("script")
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error("Falha ao carregar o SDK do Mercado Pago"))
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Devolve (memoizada) a instância do MP para a public key informada. */
export async function getMpInstance(
  publicKey: string,
): Promise<MercadoPagoInstance> {
  await loadScript()
  const cached = instances.get(publicKey)
  if (cached) return cached
  if (!window.MercadoPago) {
    throw new Error("SDK do Mercado Pago indisponível")
  }
  const instance = new window.MercadoPago(publicKey, { locale: "pt-BR" })
  instances.set(publicKey, instance)
  return instance
}

export interface TokenizedMpCard {
  cardToken: string
  /** Bandeira (`visa`, `master`...) — o `/v1/payments` exige no cartão. */
  paymentMethodId?: string
  issuerId?: string
}

/**
 * Tokeniza o cartão no browser e resolve a bandeira pelo BIN. O PAN nunca vai ao
 * nosso servidor; o token vale para UM envio. A bandeira é best-effort: a
 * recorrência (preapproval) aceita só o token, e o pagamento único recusa sem
 * ela com mensagem clara.
 */
export async function tokenizeMpCard(
  publicKey: string,
  card: {
    number: string
    holderName: string
    expiryMonth: string
    expiryYear: string
    ccv: string
    holderCpf: string
  },
): Promise<TokenizedMpCard> {
  const mp = await getMpInstance(publicKey)
  const number = card.number.replace(/\D/g, "")
  const token = await mp.createCardToken({
    cardNumber: number,
    cardholderName: card.holderName,
    cardExpirationMonth: card.expiryMonth,
    cardExpirationYear: card.expiryYear,
    securityCode: card.ccv,
    identificationType: "CPF",
    identificationNumber: card.holderCpf.replace(/\D/g, ""),
  })
  let paymentMethodId: string | undefined
  let issuerId: string | undefined
  try {
    const found = await mp.getPaymentMethods({ bin: number.slice(0, 6) })
    const first = found.results?.[0]
    paymentMethodId = first?.id
    if (first?.issuer?.id !== undefined) issuerId = String(first.issuer.id)
  } catch {
    // sem bandeira: o servidor responde com a mensagem de cartão inválido
  }
  return { cardToken: token.id, paymentMethodId, issuerId }
}
