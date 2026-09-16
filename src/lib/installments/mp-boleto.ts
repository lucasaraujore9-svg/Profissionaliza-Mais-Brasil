import type { MPCreatePaymentParams } from "@/lib/mercadopago/types"
import { MP_BOLETO_METHOD_ID } from "./schedule"

/**
 * Boleto AVULSO do Mercado Pago — o MP nao tem carne nativo, entao cada boleto
 * de um carne (de curso ou de assinatura) e um pagamento proprio.
 *
 * Um modulo so para os dois carnes: o MP recusa o boleto sem o endereco
 * completo do pagador, e duas copias desta montagem divergiriam justamente na
 * lista de campos que ele exige.
 */

/** Endereco do ALUNO, que o MP exige no boleto (entrega/cadastro). */
export interface BoletoAddress {
  cep: string | null
  rua: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export type CompleteBoletoAddress = { [K in keyof BoletoAddress]: string }

export function hasCompleteBoletoAddress(
  a: BoletoAddress,
): a is CompleteBoletoAddress {
  return Boolean(a.cep && a.rua && a.numero && a.bairro && a.cidade && a.estado)
}

/**
 * `date_of_expiration` do boleto MP: fim do dia (UTC) do vencimento. Se o
 * vencimento ja passou (catch-up do cron apos dias pulados, ou boleto vencido
 * reemitido), o MP recusa uma expiracao no passado — empurramos para daqui a 3
 * dias para o aluno pagar em atraso.
 */
export function boletoExpirationIso(dueDate: Date, now: number = Date.now()): string {
  const base =
    dueDate.getTime() < now ? new Date(now + 3 * 24 * 60 * 60 * 1000) : new Date(dueDate)
  base.setUTCHours(23, 59, 59, 0)
  return base.toISOString()
}

function splitName(nome: string): { first: string; last: string } {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? "Aluno"
  const last = parts.slice(1).join(" ") || first
  return { first, last }
}

export function mpBoletoPaymentParams(input: {
  amount: number
  description: string
  externalReference: string
  notificationUrl: string
  dueDate: Date
  /** Quem PAGA — com aluno menor, o responsavel financeiro. */
  payer: { nome: string; email: string; cpf: string }
  address: CompleteBoletoAddress
}): MPCreatePaymentParams {
  const { first, last } = splitName(input.payer.nome)
  const a = input.address
  return {
    transaction_amount: input.amount,
    description: input.description,
    payment_method_id: MP_BOLETO_METHOD_ID,
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    date_of_expiration: boletoExpirationIso(input.dueDate),
    payer: {
      email: input.payer.email,
      first_name: first,
      last_name: last,
      identification: { type: "CPF", number: input.payer.cpf.replace(/\D/g, "") },
      address: {
        zip_code: a.cep.replace(/\D/g, ""),
        street_name: a.rua,
        street_number: a.numero,
        neighborhood: a.bairro,
        city: a.cidade,
        federal_unit: a.estado,
      },
    },
  }
}
