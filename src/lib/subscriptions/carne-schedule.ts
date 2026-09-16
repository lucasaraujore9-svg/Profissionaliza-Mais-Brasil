import type { SubscriptionInterval } from "@prisma/client"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  MAX_BOLETO_INSTALLMENTS,
} from "@/lib/installments/schedule"
import {
  INTERVAL_MONTHS,
  INTERVAL_PERIOD_LABEL,
  addMonths,
  isRecurringInterval,
  type SubscriptionIntervalValue,
} from "./interval"

/**
 * Assinatura NO BOLETO (carne) — nucleo PURO: a agenda, o periodo que os
 * boletos pagos compram e a validacao do pedido. Sem Prisma, porque os
 * formularios de venda (componentes de cliente) importam os limites daqui.
 *
 * O MODELO, decidido pelo dono (2026-09-16):
 *  - **um boleto por ciclo** — plano mensal em 12 boletos sao 12 meses;
 *  - **renova sozinha** — depois do ultimo boleto do carne a plataforma segue
 *    emitindo um por ciclo, ate alguem cancelar;
 *  - **valor = preco do plano** (com o desconto manual do vendedor), congelado
 *    em `priceAtPurchase`, igual a assinatura vendida por link;
 *  - **nos dois gateways**. O Mercado Pago nao faz recorrencia no boleto, entao
 *    quem emite e a plataforma — e, para as duas pontas se comportarem igual, o
 *    Asaas segue o mesmo desenho em vez da assinatura nativa dele.
 */

/** Boletos que o vendedor pode gerar de uma vez na venda direta. */
export const SUBSCRIPTION_CARNE_MIN_COUNT = 1
export const SUBSCRIPTION_CARNE_MAX_COUNT = MAX_BOLETO_INSTALLMENTS

/**
 * Teto do 1o vencimento. Nao e cosmetico, por dois motivos:
 *  - o periodo pago comeca no 1o vencimento (ou no pagamento, se for depois).
 *    Sem teto, um 1o vencimento daqui a seis meses pago hoje daria seis meses
 *    de acesso de graca;
 *  - o Mercado Pago so aceita boleto vencendo entre 1 e 30 dias da emissao, e o
 *    1o boleto sai na venda com expiracao no FIM do dia do vencimento. 30 dias
 *    exatos estourariam o limite por algumas horas; 28 deixa folga.
 */
export const SUBSCRIPTION_CARNE_MAX_FIRST_DUE_DAYS = 28

/** Vencimento do 1o boleto quando o proprio aluno escolhe boleto na loja. */
export const SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS = 3

/** Menor boleto que os dois gateways emitem. */
export const SUBSCRIPTION_CARNE_MIN_AMOUNT = 5

/**
 * Boletos que a venda direta sugere gerar de saida: um ano de agenda (12
 * mensais, 4 trimestrais, 2 semestrais, 1 anual).
 */
export function defaultCarneCount(interval: SubscriptionInterval): number {
  const m = INTERVAL_MONTHS[interval as SubscriptionIntervalValue]
  return m ? Math.max(1, Math.round(12 / m)) : 1
}

/** Quantos boletos de renovacao uma passada do cron cria por assinatura. */
export const CARNE_RENEWAL_MAX_PER_RUN = 3

/**
 * Prefixo do `external_reference` do boleto no Mercado Pago. POR LINHA (e nao
 * `pmb_sub_<id>`) porque o webhook do MP trata `cancelled` de uma assinatura
 * como estorno e revoga tudo — e um boleto que venceu sem pagamento chega
 * justamente como `cancelled`. Com o prefixo proprio o evento cai no
 * tratamento do carne, que so reemite o boleto.
 */
export const MP_CARNE_REF_PREFIX = "subbol_"

/** Estados de uma linha do carne em `SubscriptionPayment.status`. */
export const CARNE_STATUS = {
  /** Linha criada, boleto ainda nao emitido. */
  SCHEDULED: "SCHEDULED",
  /** Boleto emitido, em aberto. */
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const

/** Linhas que ainda podem ser pagas (ou emitidas). */
export const CARNE_OPEN_STATUSES: string[] = [
  CARNE_STATUS.SCHEDULED,
  CARNE_STATUS.PENDING,
  CARNE_STATUS.OVERDUE,
]

function months(interval: SubscriptionInterval): number | null {
  return INTERVAL_MONTHS[interval as SubscriptionIntervalValue]
}

/** Meio-dia UTC do dia `ymd` — o formato em que o carne grava vencimentos. */
export function noonUtc(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`)
}

/**
 * Vencimento do boleto `number` (1, 2, 3...). Sempre a partir do 1o vencimento
 * e nunca encadeado no anterior: encadear arrastaria o clamp de fim de mes
 * (31/01 -> 28/02 -> 28/03...) e o dia de pagamento escorregaria para sempre.
 */
export function carneDueDate(
  firstDueDate: Date,
  interval: SubscriptionInterval,
  number: number,
): Date {
  const m = months(interval)
  if (m === null || number <= 1) return new Date(firstDueDate)
  return addMonths(firstDueDate, m * (number - 1))
}

/**
 * Fim do periodo que os boletos PAGOS compram.
 *
 * `inicio + ciclos pagos`, com o inicio no 1o vencimento — ou no 1o pagamento,
 * se ele veio depois. Contar a partir da AGENDA (e nao "pagou, soma um ciclo a
 * partir de hoje") e o que mantem o boleto seguinte vencendo junto com o fim do
 * periodo: pago o 1o boleto adiantado, o acesso nao pode acabar semanas antes
 * do 2o boleto vencer, senao a carencia correria contra uma conta que o aluno
 * nem recebeu.
 *
 * Conta TODO pagamento confirmado, inclusive fora de ordem: quem pagou o 3o
 * boleto antes do 2o pagou dois ciclos e tem dois ciclos de acesso.
 *
 * `null` = nada a conceder (nenhum pagamento, ou acesso vitalicio — que nao tem
 * fim de periodo e e decidido pelo status).
 */
export function carnePeriodEnd(input: {
  firstDueDate: Date
  firstPaidAt: Date | null
  paidCount: number
  interval: SubscriptionInterval
}): Date | null {
  const m = months(input.interval)
  if (m === null || input.paidCount <= 0 || !input.firstPaidAt) return null
  const paidDay = noonUtc(
    input.firstPaidAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  )
  const start = paidDay > input.firstDueDate ? paidDay : input.firstDueDate
  return addMonths(start, m * input.paidCount)
}

/**
 * Boletos de RENOVACAO a criar agora: quando o ultimo boleto da agenda entra na
 * janela em que o aluno ja o ve (7 dias), o seguinte e preparado. Assim o
 * carne nunca acaba — e o que "renova sozinha" significa aqui.
 *
 * Com catch-up limitado: um cron parado por semanas nao cria uma pilha de
 * boletos de uma vez so.
 */
export function carneRowsToAppend(input: {
  lastNumber: number
  firstDueDate: Date
  interval: SubscriptionInterval
  now: Date
  windowDays?: number
  max?: number
}): Array<{ number: number; dueDate: Date }> {
  if (!isRecurringInterval(input.interval) || input.lastNumber < 1) return []
  const windowDays = input.windowDays ?? INSTALLMENT_REVEAL_WINDOW_DAYS
  const max = input.max ?? CARNE_RENEWAL_MAX_PER_RUN
  const horizon = input.now.getTime() + windowDays * 24 * 60 * 60 * 1000

  const out: Array<{ number: number; dueDate: Date }> = []
  let last = input.lastNumber
  while (out.length < max) {
    const lastDue = carneDueDate(input.firstDueDate, input.interval, last)
    if (lastDue.getTime() > horizon) break
    last += 1
    out.push({
      number: last,
      dueDate: carneDueDate(input.firstDueDate, input.interval, last),
    })
  }
  return out
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Vencimento `days` dias depois de hoje (dia civil brasileiro), ao meio-dia UTC. */
export function carneDueInDays(days: number, now: Date = new Date()): Date {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  return noonUtc(addDaysYmd(today, days))
}

export type CarneRequestCheck =
  | { ok: true; firstDueDate: Date }
  | { ok: false; error: string }

/**
 * O pedido de carne da VENDA DIRETA faz sentido? Mensagens prontas para a tela.
 * `amount` e o valor de cada boleto (preco do plano ja com o desconto).
 */
export function checkCarneRequest(input: {
  count: number
  /** YYYY-MM-DD, como vem do `<input type="date">`. */
  firstDueDate: string
  interval: SubscriptionInterval
  amount: number
  now?: Date
}): CarneRequestCheck {
  if (!isRecurringInterval(input.interval)) {
    return {
      ok: false,
      error:
        "Acesso vitalício é pago de uma vez só — venda pelo link de pagamento, onde o aluno pode escolher boleto.",
    }
  }
  if (
    !Number.isInteger(input.count) ||
    input.count < SUBSCRIPTION_CARNE_MIN_COUNT ||
    input.count > SUBSCRIPTION_CARNE_MAX_COUNT
  ) {
    return {
      ok: false,
      error: `Escolha entre ${SUBSCRIPTION_CARNE_MIN_COUNT} e ${SUBSCRIPTION_CARNE_MAX_COUNT} boletos.`,
    }
  }
  if (!(input.amount >= SUBSCRIPTION_CARNE_MIN_AMOUNT)) {
    return {
      ok: false,
      error: `Cada boleto precisa ser de pelo menos R$ ${SUBSCRIPTION_CARNE_MIN_AMOUNT},00.`,
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueDate)) {
    return { ok: false, error: "Data do 1º vencimento inválida." }
  }
  const first = noonUtc(input.firstDueDate)
  if (Number.isNaN(first.getTime()) || first.toISOString().slice(0, 10) !== input.firstDueDate) {
    return { ok: false, error: "Data do 1º vencimento inválida." }
  }
  // Dia civil BRASILEIRO: o servidor roda em UTC e, das 21h em diante, "hoje"
  // em UTC ja e amanha aqui.
  const today = (input.now ?? new Date()).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
  if (input.firstDueDate < today) {
    return { ok: false, error: "O 1º vencimento deve ser hoje ou uma data futura." }
  }
  if (input.firstDueDate > addDaysYmd(today, SUBSCRIPTION_CARNE_MAX_FIRST_DUE_DAYS)) {
    return {
      ok: false,
      error: `O 1º vencimento deve ser em até ${SUBSCRIPTION_CARNE_MAX_FIRST_DUE_DAYS} dias.`,
    }
  }
  return { ok: true, firstDueDate: first }
}

/** Como a assinatura no boleto é explicada ao aluno que escolhe boleto. */
export function carneBoletoNotice(interval: SubscriptionInterval): string {
  if (!isRecurringInterval(interval)) {
    return `Boleto único, com vencimento em ${SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS} dias. O acesso é liberado quando ele for compensado (até 3 dias úteis).`
  }
  return `Um boleto por ${INTERVAL_PERIOD_LABEL[interval as SubscriptionIntervalValue]}. O primeiro vence em ${SUBSCRIPTION_CARNE_SELF_SERVICE_DUE_DAYS} dias; os próximos ficam disponíveis na sua área do aluno ${INSTALLMENT_REVEAL_WINDOW_DAYS} dias antes de cada vencimento.`
}
