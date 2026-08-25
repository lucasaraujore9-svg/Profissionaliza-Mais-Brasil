/**
 * REGRAS PEDAGOGICAS — o motor PURO que decide quando uma aula abre.
 *
 * A unidade define COMO o conteudo e liberado: em que ordem, em que ritmo e em
 * que horario. Sao tres eixos INDEPENDENTES, e os tres podem valer ao mesmo
 * tempo:
 *
 *   1. ORDEM     (`releaseMode`)      — livre, sequencial ou por gotejamento.
 *   2. RITMO     (`dailyLessonLimit`) — quantas aulas por dia civil brasileiro.
 *   3. HORARIO   (`accessDays` + `accessStart`/`accessEnd`) — quando pode entrar.
 *
 * ⚠️ ESTE ARQUIVO TEM UM GEMEO NO LMS (`src/lib/pedagogia.ts` do repo "Area do
 * Aluno PMB"). A duplicacao e DELIBERADA e segue o precedente de
 * `tenant-theme.ts`: o LMS e quem conhece a grade e precisa decidir aula a aula
 * sem uma chamada de rede por clique; o PMB precisa das MESMAS respostas para
 * pintar a area do aluno, simular a regra na tela de configuracao e fechar a
 * janela de horario na EA. Ao mexer numa regra aqui, mexa no gemeo — os dois
 * tem o mesmo conjunto de testes, com os mesmos nomes, exatamente para que a
 * divergencia apareca.
 *
 * O que NAO mora aqui: leitura de banco, fuso (recebido pronto em minutos) e
 * qualquer coisa especifica de fornecedora. `resolvePolicy` e a unica funcao
 * que conhece a PRECEDENCIA entre unidade e curso.
 */

/** Como a proxima aula e liberada. */
export type ReleaseMode =
  /** Sem trava de ordem: o aluno escolhe por onde comecar (comportamento historico). */
  | "FREE"
  /** So abre a proxima depois de concluir a anterior. */
  | "SEQUENTIAL"
  /** A aula N so abre N x `dripDays` dias depois da matricula. */
  | "DRIP"

/** A cota diaria conta por curso ou somando todos os cursos do aluno na unidade. */
export type QuotaScope = "COURSE" | "STUDENT"

/** Em que unidade o gotejamento avanca. */
export type DripUnit = "LESSON" | "MODULE"

export interface PedagogyPolicy {
  releaseMode: ReleaseMode
  /** Intervalo do gotejamento, em dias. So vale com `releaseMode: "DRIP"`. */
  dripDays: number
  /** O gotejamento avanca de aula em aula ou de modulo em modulo. */
  dripUnit: DripUnit
  /**
   * Teto de aulas CONCLUIDAS por dia civil brasileiro. `null` = sem cota.
   * Rever aula ja concluida nunca conta nem e barrado — a cota limita o quanto
   * o aluno AVANCA, nao quantas vezes ele estuda.
   */
  dailyLessonLimit: number | null
  quotaScope: QuotaScope
  /**
   * Dias da semana em que o aluno pode acessar (0 = domingo ... 6 = sabado).
   * Lista VAZIA = todos os dias. Nunca use `[]` para dizer "nenhum dia": uma
   * politica que tranca o aluno para sempre nao e configuravel por engano.
   */
  accessDays: number[]
  /** Inicio da janela em minutos desde a meia-noite (0..1439). `null` = sem hora minima. */
  accessStartMin: number | null
  /** Fim da janela em minutos desde a meia-noite (1..1440). `null` = sem hora maxima. */
  accessEndMin: number | null
}

/** Politica de quem nao configurou nada: exatamente o comportamento historico. */
export const DEFAULT_POLICY: PedagogyPolicy = {
  releaseMode: "FREE",
  dripDays: 7,
  dripUnit: "MODULE",
  dailyLessonLimit: null,
  quotaScope: "COURSE",
  accessDays: [],
  accessStartMin: null,
  accessEndMin: null,
}

export const MAX_DRIP_DAYS = 90
export const MAX_DAILY_LESSONS = 100
const MINUTES_IN_DAY = 1440

/** `true` quando a politica nao restringe nada — usada para pular trabalho e para a UI. */
export function isPolicyOpen(p: PedagogyPolicy): boolean {
  return (
    p.releaseMode === "FREE" &&
    p.dailyLessonLimit === null &&
    p.accessDays.length === 0 &&
    p.accessStartMin === null &&
    p.accessEndMin === null
  )
}

/**
 * Normaliza o que veio do banco (Json, portanto `unknown`) numa politica valida.
 *
 * Campo ausente ou invalido cai no DEFAULT em vez de lancar: a politica e lida
 * no caminho quente do player, e um JSON corrompido nao pode virar tela de erro
 * para o aluno. Um valor fora de faixa e sempre resolvido para o lado MENOS
 * restritivo — na duvida, ninguem e travado.
 */
export function parsePolicy(raw: unknown): PedagogyPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_POLICY
  const o = raw as Record<string, unknown>

  const releaseMode: ReleaseMode =
    o.releaseMode === "SEQUENTIAL" || o.releaseMode === "DRIP"
      ? o.releaseMode
      : "FREE"

  const dripDays = clampInt(o.dripDays, 1, MAX_DRIP_DAYS, DEFAULT_POLICY.dripDays)
  const dripUnit: DripUnit = o.dripUnit === "LESSON" ? "LESSON" : "MODULE"

  // `0` e negativo viram "sem cota": uma cota de zero aulas por dia travaria o
  // aluno para sempre, e nenhum caminho de configuracao deveria produzi-la.
  const rawLimit = typeof o.dailyLessonLimit === "number" ? Math.floor(o.dailyLessonLimit) : null
  const dailyLessonLimit =
    rawLimit !== null && Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, MAX_DAILY_LESSONS)
      : null

  const quotaScope: QuotaScope = o.quotaScope === "STUDENT" ? "STUDENT" : "COURSE"

  const accessDays = Array.isArray(o.accessDays)
    ? [...new Set(o.accessDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6 && Number.isInteger(d)))].sort()
    : []

  const accessStartMin = clampNullableInt(o.accessStartMin, 0, MINUTES_IN_DAY - 1)
  const accessEndMin = clampNullableInt(o.accessEndMin, 1, MINUTES_IN_DAY)

  return {
    releaseMode,
    dripDays,
    dripUnit,
    dailyLessonLimit,
    quotaScope,
    // Os SETE dias marcados sao o mesmo que "todos os dias": guardar `[]`
    // mantem uma representacao unica e faz `isPolicyOpen` reconhecer a
    // politica destravada.
    accessDays: accessDays.length === 7 ? [] : accessDays,
    // Janela invertida ou de duracao zero (fim <= inicio) e descartada INTEIRA.
    // Guardar so uma das pontas produziria uma regra que ninguem pediu; e
    // aceita-la fecharia o acesso 24h por dia.
    ...normalizeWindow(accessStartMin, accessEndMin),
  }
}

function normalizeWindow(
  start: number | null,
  end: number | null,
): Pick<PedagogyPolicy, "accessStartMin" | "accessEndMin"> {
  if (start !== null && end !== null && end <= start) {
    return { accessStartMin: null, accessEndMin: null }
  }
  return { accessStartMin: start, accessEndMin: end }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

function clampNullableInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return Math.min(max, Math.max(min, Math.floor(v)))
}

/**
 * PRECEDENCIA: o curso vence a unidade, e so quando tem politica propria.
 *
 * O override e do TenantCourse (a linha "curso X nesta vitrine"), nao do
 * Course: o mesmo curso pode ser vendido por varias unidades, cada uma com o
 * proprio ritmo. `null` no curso = herda — nao e "sem regra".
 */
export function resolvePolicy(
  tenantPolicy: unknown,
  coursePolicy: unknown,
): PedagogyPolicy {
  if (coursePolicy != null) return parsePolicy(coursePolicy)
  return parsePolicy(tenantPolicy)
}
