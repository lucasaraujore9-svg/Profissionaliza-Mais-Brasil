import { getBillingInfo, getPixQrCode } from "./client"
import type { AsaasPayment } from "./types"

/**
 * O que o aluno usa para pagar uma cobrança do Asaas DENTRO da nossa página:
 * o QR do PIX ou a linha digitável + PDF do boleto.
 *
 * Nunca a fatura hospedada (`invoiceUrl`): ela é uma página de pagamento do
 * Asaas, e o link de pagamento de uma loja é sempre a página da plataforma.
 * Quando o instrumento não sai, quem chama devolve erro (ou o link da nossa
 * página) — nunca cai na fatura.
 */

export interface PixInstrument {
  qrCode: string
  qrCodeBase64: string
}

export interface BoletoInstrument {
  url: string
  digitableLine?: string
}

export async function asaasPixInstrument(
  paymentId: string,
  apiKey: string,
): Promise<PixInstrument | null> {
  const qr = await getPixQrCode(paymentId, apiKey).catch(() => null)
  if (!qr?.payload) return null
  return { qrCode: qr.payload, qrCodeBase64: qr.encodedImage ?? "" }
}

export async function asaasBoletoInstrument(
  payment: Pick<AsaasPayment, "id" | "bankSlipUrl">,
  apiKey: string,
): Promise<BoletoInstrument | null> {
  const billing = await getBillingInfo(payment.id, apiKey).catch(() => null)
  const url = billing?.bankSlip?.bankSlipUrl ?? payment.bankSlipUrl
  if (!url) return null
  return { url, digitableLine: billing?.bankSlip?.identificationField }
}
