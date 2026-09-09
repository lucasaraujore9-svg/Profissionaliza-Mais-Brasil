/**
 * Nucleo PURO da "cota de aulas" — a trava de conclusao proporcional ao
 * pagamento. Sem I/O: so a matematica da cota e as regras de decisao, testavel
 * isoladamente (mesmo padrao de src/lib/installments/schedule.ts).
 *
 * PROBLEMA: na venda parcelada o `fulfillEnrollment` libera o curso INTEIRO na
 * 1a parcela. A unica trava existente e a de inadimplencia (sweep do carne), que
 * so dispara DEPOIS do vencimento. Quem paga 1 de 6 pode maratonar o curso,
 * emitir o certificado e sumir antes da 2a.
 *
 * REGRA: o aluno so avanca ate a fracao do curso que ja pagou —
 *
 *     cota = floor(parcelas pagas / parcelas totais x 100)
 *
 * A cota acompanha o plano escolhido: 2x libera 50% ja na 1a parcela; 6x libera
 * 16%; 12x (mensalidade) libera 8%. Ao ATINGIR a cota o curso trava, e a parcela
 * seguinte destrava a proxima fatia.
 *
 * Escopo: BOLETO_INSTALLMENT (carne) e MONTHLY (mensalidade). ONE_TIME esta 100%
 * pago na hora e CARD_INSTALLMENT ja teve o credito autorizado na compra — nos
 * dois a cota e sempre 100%.
 */
import type { PaymentType } from "@prisma/client"

/** Formas de pagamento em que o acesso e liberado em fatias. */
export const PACE_GATED_PAYMENT_TYPES: readonly PaymentType[] = [
  "BOLETO_INSTALLMENT",
  "MONTHLY",
] as const

/** Contagem de parcelas da matricula — o que define a cota. */
export interface PacePlan {
  paymentType: PaymentType
  /** = numero de parcelas escolhido na venda. null/1 = sem parcelamento. */
  installmentsTotal: number | null
  installmentsPaid: number
}

/**
 * Matricula que pode ser SATELITE de uma compra com varios cursos (pacote do
 * catalogo ou venda direta multi-curso).
 *
 * A satelite nao tem cobranca propria — nasce ONE_TIME, finalAmount 0 e
 * installmentsTotal null — porque quem carrega o Payment e a PRIMARIA. Logo o
 * plano de parcelamento dela e o da primaria: sem isso, o curso 2 de uma venda
 * em 6x sairia 100% liberado ja na 1a parcela, enquanto o curso 1 ficava
 * racionado em 16%.
 *
 * O PROGRESSO continua sendo o da propria matricula (cada curso tem o seu) — o
 * que vem de cima e so o plano.
 */
export interface PacePlanSource extends PacePlan {
  /** Plano da matricula que carrega a cobranca. null/ausente = e a propria. */
  primaryEnrollment?: PacePlan | null
}

/**
 * Plano EFETIVO de uma matricula: o da primaria quando ela e satelite, o proprio
 * caso contrario. Ponto UNICO onde essa heranca acontece — todas as funcoes
 * abaixo passam por aqui, entao nenhuma delas pode divergir.
 */
export function effectivePacePlan(row: PacePlanSource): PacePlan {
  return row.primaryEnrollment ?? row
}

/**
 * Fragmento de `include`/`select` do Prisma que carrega o plano da primaria.
 *
 * TODA leitura de matricula que alimenta as funcoes acima precisa espalhar isto
 * (`...PACE_PRIMARY_SELECT`). Sem ele a satelite chega como ONE_TIME sem
 * parcelas — ou seja, como curso quitado — e escapa da cota silenciosamente.
 * Fica aqui, ao lado de `PacePlanSource`, para o tipo e a consulta nunca
 * andarem separados.
 */
export const PACE_PRIMARY_SELECT = {
  primaryEnrollment: {
    select: {
      paymentType: true,
      installmentsTotal: true,
      installmentsPaid: true,
    },
  },
} as const

/** Estado completo da cota — reusado pelo motor, pela API e pela UI. */
export interface PaceState {
  /** A matricula esta sob a regra da cota? */
  gated: boolean
  /** Fatia do curso liberada, 0-100. Fora da regra (ou quitado) => 100. */
  allowedPercent: number
  /** O aluno atingiu a cota e deve ser travado? */
  blocked: boolean
  installmentsPaid: number
  installmentsTotal: number | null
  /** Parcelas que ainda faltam para liberar o curso inteiro. */
  remaining: number
}

/**
 * A matricula esta sob a regra? Exige forma de pagamento parcelada E mais de uma
 * parcela — uma venda "parcelada em 1x" e, na pratica, pagamento a vista.
 */
export function isPaceGatedPlan(row: PacePlanSource): boolean {
  const plan = effectivePacePlan(row)
  if (!PACE_GATED_PAYMENT_TYPES.includes(plan.paymentType)) return false
  return (plan.installmentsTotal ?? 0) > 1
}

/**
 * O MESMO teste de `isPaceGatedPlan`, escrito como `where` do Prisma — para a
 * varredura diaria (`installments/sweep.ts`) poder pre-filtrar as candidatas no
 * banco em vez de carregar a base inteira e decidir em memoria.
 *
 * Sao duas escritas da mesma regra, e por isso ha um teste de PARIDADE entre
 * elas: qualquer divergencia quebra o build. Foi assim que a satelite escapava —
 * o filtro olhava so as colunas da propria linha (`ONE_TIME`, sem parcelas) e o
 * curso 2 de um carne nunca entrava na varredura.
 *
 * NAO inclui `status` nem os filtros de atividade: quem chama compoe.
 */
const GATED_PLAN_COLUMNS = {
  paymentType: { in: [...PACE_GATED_PAYMENT_TYPES] },
  installmentsTotal: { gt: 1 },
}

export const PACE_GATED_WHERE = {
  OR: [
    // Plano proprio (compra de curso avulso / matricula primaria).
    GATED_PLAN_COLUMNS,
    // Plano herdado (satelite de pacote ou de venda multi-curso).
    { primaryEnrollment: { is: GATED_PLAN_COLUMNS } },
  ],
}

/**
 * "O conteudo desta matricula esta sujeito a cota?" — como `where` do Prisma.
 *
 * Fica SEPARADO de `PACE_GATED_WHERE` de proposito: aquele e o gemeo SQL de
 * `isPaceGatedPlan` e tem um teste de PARIDADE com ele; misturar o tipo de
 * conteudo ali quebraria a paridade sem que a funcao pura mudasse de contrato
 * (ela recebe um PLANO, e plano nao sabe o que esta sendo vendido).
 *
 * Quem DECIDE e `evaluatePaceGate`, que consulta `isPaceGateApplicable` na linha
 * carregada — entao uma consulta que esqueca esta clausula produz trabalho
 * desperdicado, nunca comportamento errado. Aqui ela serve para a varredura nao
 * carregar e-book toda noite e para os numeros de impacto do /admin nao
 * prometerem uma trava que nao vai acontecer.
 */
export const PACE_GATED_CONTENT_WHERE = {
  course: { is: { contentType: "COURSE" as const } },
}

/**
 * Fatia do curso liberada pelas parcelas ja pagas (0-100).
 *
 * `floor` e deliberado: com 3 parcelas a 1a libera 33% (nao 33,33% arredondado
 * para 34) — nunca entregamos mais do que foi pago. Fora da regra da cota, ou
 * plano ja quitado, devolve 100 (sem trava).
 */
export function computeAllowedPercent(row: PacePlanSource): number {
  if (!isPaceGatedPlan(row)) return 100
  const plan = effectivePacePlan(row)
  const total = plan.installmentsTotal as number
  const paid = Math.max(0, Math.min(plan.installmentsPaid, total))
  return Math.max(0, Math.min(100, Math.floor((paid / total) * 100)))
}

/**
 * Ainda ha parcela a pagar? E a base da trava de CERTIFICADO: enquanto o plano
 * nao estiver quitado, a matricula nao pode ser concluida — independentemente do
 * progresso na plataforma de aulas.
 */
export function hasOpenInstallmentPlan(row: PacePlanSource): boolean {
  if (!isPaceGatedPlan(row)) return false
  const plan = effectivePacePlan(row)
  return plan.installmentsPaid < (plan.installmentsTotal as number)
}

/**
 * A CONCLUSAO do curso esta travada pelo parcelamento?
 *
 * Fonte UNICA da verdade para a trava de certificado — usada tanto pelo backend
 * (`issueCertificateIfEligible`) quanto pela UI (area do aluno, formulario do
 * painel), para que as duas camadas nunca discordem sobre o que esta liberado.
 * Sem isso, a UI ofereceria um botao "emitir certificado" que o backend recusa.
 */
export function isConclusionBlockedByPace(
  input: PacePlanSource & {
    /** Liberacao manual da cota (SUPER_ADMIN) desarma a trava. */
    paceExemptAt?: Date | null
    /** Interruptor da unidade/rede — ver pace-settings.ts. */
    gateEnabled: boolean
  },
): boolean {
  if (!input.gateEnabled) return false
  if (input.paceExemptAt) return false
  return hasOpenInstallmentPlan(input)
}

/**
 * O aluno bateu a cota? Comparacao com `>=` (nao `>`): "ao chegar em 50% das
 * aulas, o curso e bloqueado". Com a cota em 100 (quitado / fora da regra) nunca
 * bloqueia, mesmo com 100% de progresso.
 */
export function isPaceBlocked(
  input: PacePlanSource & { progressPercent: number | null },
): boolean {
  const allowedPercent = computeAllowedPercent(input)
  if (allowedPercent >= 100) return false
  // Progresso e SEMPRE o da propria matricula: cada curso da compra avanca no
  // seu ritmo, mesmo compartilhando o parcelamento.
  return (input.progressPercent ?? 0) >= allowedPercent
}

/** Avalia a cota de uma matricula de uma so vez (motor + API + UI). */
export function evaluatePace(
  input: PacePlanSource & { progressPercent: number | null },
): PaceState {
  const gated = isPaceGatedPlan(input)
  const allowedPercent = computeAllowedPercent(input)
  // Contagem exibida vem do plano EFETIVO — numa satelite, "2 de 6 parcelas"
  // e a contagem da compra, nao os zeros da propria linha.
  const plan = effectivePacePlan(input)
  const total = plan.installmentsTotal ?? 0
  return {
    gated,
    allowedPercent,
    blocked: isPaceBlocked(input),
    installmentsPaid: plan.installmentsPaid,
    installmentsTotal: plan.installmentsTotal,
    remaining: gated ? Math.max(0, total - plan.installmentsPaid) : 0,
  }
}

/** Termo da cobranca na copy: carne fala "parcela"; mensal, "mensalidade". */
export function installmentWord(
  paymentType: PaymentType,
  plural = false,
): string {
  const isParcela = paymentType !== "MONTHLY"
  if (isParcela) return plural ? "parcelas" : "parcela"
  return plural ? "mensalidades" : "mensalidade"
}

/** Mensagem exibida ao aluno quando a cota trava o curso. */
export function paceBlockedMessage(
  state: PaceState,
  paymentType: PaymentType,
): string {
  const word = installmentWord(paymentType)
  return (
    `Você liberou ${state.allowedPercent}% do curso ` +
    `(${state.installmentsPaid} de ${state.installmentsTotal} ${installmentWord(paymentType, true)} pagas). ` +
    `Pague a próxima ${word} para liberar as aulas seguintes.`
  )
}
