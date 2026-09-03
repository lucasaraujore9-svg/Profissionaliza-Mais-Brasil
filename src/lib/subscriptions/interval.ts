import type { SubscriptionInterval } from "@prisma/client"

/**
 * Periodicidade da assinatura — mensal, trimestral, semestral, anual ou
 * VITALICIA.
 *
 * FONTE UNICA da conversao "periodicidade -> quantos meses / que ciclo no
 * gateway / como se escreve isso na tela". Modulo PURO (sem Prisma) porque os
 * formularios do /admin e do /painel sao componentes de cliente: importar dali
 * um modulo que toca o banco arrastaria o driver `pg` para o navegador e
 * quebraria o build com "Can't resolve 'dns'". Mesma regra de `schema.ts`.
 *
 * O VITALICIO E O CASO QUE MUDA A NATUREZA DO PRODUTO, e por isso ele aparece
 * em quase toda funcao daqui: as outras quatro sao RECORRENCIAS (o gateway
 * cobra sozinho e `currentPeriodEnd` anda a cada ciclo); o vitalicio e UMA
 * cobranca que da acesso permanente. Tratar o vitalicio como "recorrencia de N
 * meses muito grande" seria a decisao errada em quatro lugares ao mesmo tempo:
 * criaria assinatura no gateway (cobrando de novo la na frente), deixaria a
 * varredura de carencia cancelar quem pagou, mostraria "proxima cobranca" para
 * quem nao tem nenhuma, e o cancelamento tentaria parar uma recorrencia que
 * nunca existiu.
 */

export const SUBSCRIPTION_INTERVALS = [
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
  "LIFETIME",
] as const

export type SubscriptionIntervalValue = (typeof SUBSCRIPTION_INTERVALS)[number]

/**
 * Meses de um ciclo. `null` no vitalicio porque nao existe ciclo — e o valor
 * que faz `addInterval` devolver `null` e a varredura nunca alcancar a linha.
 */
export const INTERVAL_MONTHS: Record<SubscriptionIntervalValue, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  LIFETIME: null,
}

/** Nome do produto ("Assinatura trimestral"). */
export const INTERVAL_LABEL: Record<SubscriptionIntervalValue, string> = {
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  LIFETIME: "Vitalícia",
}

/**
 * Sufixo do preco ("R$ 49,90/mês"). Vazio no vitalicio DE PROPOSITO: qualquer
 * sufixo de tempo ali ("/vitalício") sugeriria recorrencia num produto que
 * cobra uma vez so.
 */
export const INTERVAL_PRICE_SUFFIX: Record<SubscriptionIntervalValue, string> = {
  MONTHLY: "/mês",
  QUARTERLY: "/trimestre",
  SEMIANNUAL: "/semestre",
  ANNUAL: "/ano",
  LIFETIME: "",
}

/** Como a cobranca e descrita ao aluno ("cobrado a cada 3 meses"). */
export const INTERVAL_CHARGE_LABEL: Record<SubscriptionIntervalValue, string> = {
  MONTHLY: "Cobrado todo mês",
  QUARTERLY: "Cobrado a cada 3 meses",
  SEMIANNUAL: "Cobrado a cada 6 meses",
  ANNUAL: "Cobrado uma vez por ano",
  LIFETIME: "Pagamento único — acesso vitalício",
}

/** Nome do periodo pago, para frases do tipo "válido até o fim do <periodo>". */
export const INTERVAL_PERIOD_LABEL: Record<SubscriptionIntervalValue, string> = {
  MONTHLY: "mês",
  QUARTERLY: "trimestre",
  SEMIANNUAL: "semestre",
  ANNUAL: "ano",
  LIFETIME: "acesso vitalício",
}

/**
 * Ha renovacao? E a pergunta que separa os dois produtos — use SEMPRE esta
 * funcao em vez de comparar com `"LIFETIME"` na mao, para uma periodicidade
 * nova nascer coberta por todos os call sites.
 */
export function isRecurringInterval(interval: SubscriptionInterval): boolean {
  return INTERVAL_MONTHS[interval as SubscriptionIntervalValue] !== null
}

/** N meses a frente, com clamp de fim de mes (31/01 + 1 mes -> 28/02). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  const day = d.getUTCDate()
  // Fixa o dia 1 ANTES de somar: sem isso, 31/01 + 1 mês vira 03/03 (o
  // JavaScript transborda em vez de saturar) e o assinante ganharia dois dias.
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

/**
 * Fim do proximo ciclo a partir de `base`. `null` no vitalicio — e esse `null`
 * que `currentPeriodEnd` guarda, e e ele que a varredura de carencia usa para
 * NUNCA alcancar quem comprou acesso permanente.
 */
export function addInterval(
  base: Date,
  interval: SubscriptionInterval,
): Date | null {
  const months = INTERVAL_MONTHS[interval as SubscriptionIntervalValue]
  if (months === null) return null
  return addMonths(base, months)
}

/**
 * Ciclo equivalente no Asaas. `null` no vitalicio: la nao se cria assinatura,
 * cria-se uma cobranca avulsa (`POST /payments`).
 *
 * Os nomes sao do Asaas e nao batem com os nossos por acaso — `SEMIANNUAL` la e
 * `SEMIANNUALLY` e `ANNUAL` e `YEARLY`. E exatamente por isso que a traducao
 * mora aqui e nao espalhada nos call sites.
 */
export function asaasCycleFor(
  interval: SubscriptionInterval,
): "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY" | null {
  switch (interval) {
    case "MONTHLY":
      return "MONTHLY"
    case "QUARTERLY":
      return "QUARTERLY"
    case "SEMIANNUAL":
      return "SEMIANNUALLY"
    case "ANNUAL":
      return "YEARLY"
    case "LIFETIME":
      return null
  }
}

/**
 * `auto_recurring` do Mercado Pago. Sempre em MESES (o MP tambem aceita "days",
 * mas contar 90 dias daria trimestres que deslizam) e `null` no vitalicio, que
 * vira preferencia de pagamento unico.
 */
export function mpRecurrenceFor(
  interval: SubscriptionInterval,
): { frequency: number; frequency_type: "months" } | null {
  const months = INTERVAL_MONTHS[interval as SubscriptionIntervalValue]
  if (months === null) return null
  return { frequency: months, frequency_type: "months" }
}
