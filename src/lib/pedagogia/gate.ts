/**
 * REGRAS PEDAGOGICAS — avaliacao. Puro: recebe a politica e o ESTADO da aula,
 * devolve se ela abre e, quando nao abre, POR QUE e QUANDO abre.
 *
 * Gemeo no LMS (`src/lib/pedagogia.ts`) — ver o cabecalho de `policy.ts`.
 *
 * Por que devolver `unlockAt` junto do `false`: uma aula travada sem data e
 * indistinguivel de um erro para o aluno. Todo motivo aqui tem ou uma data
 * (gotejamento, janela, cota diaria) ou uma acao clara (concluir a anterior).
 */
import type { PedagogyPolicy } from "./policy"
import { brWeekday, brMinutesOfDay, brDayStartUtc, brInstantAt } from "./br-time"

export type LockReason =
  /** Falta concluir a aula anterior (`releaseMode: "SEQUENTIAL"`). */
  | "SEQUENTIAL"
  /** Ainda nao chegou a data do gotejamento (`releaseMode: "DRIP"`). */
  | "DRIP"
  /** O aluno ja bateu a cota de aulas de hoje. */
  | "DAILY_LIMIT"
  /** Fora do horario/dia liberado pela unidade. */
  | "WINDOW"

export interface LessonGate {
  open: boolean
  reason?: LockReason
  /** Quando destrava sozinha. `null` = depende de uma acao do aluno, nao do relogio. */
  unlockAt?: Date | null
}

const OPEN: LessonGate = { open: true }
const MS_PER_DAY = 86_400_000

/* ─────────────────────────── Janela de horario ─────────────────────────── */

export interface WindowState {
  open: boolean
  /** Proximo instante em que a janela abre. `null` quando ja esta aberta. */
  opensAt: Date | null
}

/**
 * A janela esta aberta AGORA? Avaliada em dia e hora civis BRASILEIROS — o
 * servidor roda em UTC, entao uma janela "18:00 as 22:00" comparada em UTC
 * fecharia o acesso das 15h as 19h para o aluno.
 *
 * As duas pontas sao independentes: so `accessStartMin` significa "a partir
 * das", so `accessEndMin` significa "ate as". A janela NUNCA cruza a
 * meia-noite: `parsePolicy` descarta o par invertido, porque "22:00 as 02:00"
 * exigiria decidir a qual dia da semana a madrugada pertence — pergunta que a
 * tela de configuracao nao faz e que o aluno responderia diferente de nos.
 */
export function windowState(p: PedagogyPolicy, now: Date = new Date()): WindowState {
  const hasDays = p.accessDays.length > 0
  const hasHours = p.accessStartMin !== null || p.accessEndMin !== null
  if (!hasDays && !hasHours) return { open: true, opensAt: null }

  const weekday = brWeekday(now)
  const minutes = brMinutesOfDay(now)

  const dayOk = !hasDays || p.accessDays.includes(weekday)
  const afterStart = p.accessStartMin === null || minutes >= p.accessStartMin
  const beforeEnd = p.accessEndMin === null || minutes < p.accessEndMin

  if (dayOk && afterStart && beforeEnd) return { open: true, opensAt: null }
  return { open: false, opensAt: nextWindowOpensAt(p, now) }
}

/**
 * Proximo instante (UTC) em que a janela abre.
 *
 * Varre os proximos 8 dias em vez de calcular em forma fechada: sao no maximo 8
 * iteracoes, e a forma fechada teria que reproduzir a aritmetica de horario de
 * verao na mao. O 8o dia cobre o caso da janela que abre daqui a exatamente uma
 * semana (um unico dia marcado, ja passado hoje).
 */
export function nextWindowOpensAt(p: PedagogyPolicy, now: Date = new Date()): Date | null {
  const hasDays = p.accessDays.length > 0
  const startMin = p.accessStartMin ?? 0
  const endMin = p.accessEndMin ?? 1440
  if (!hasDays && p.accessStartMin === null && p.accessEndMin === null) return null

  const todayStart = brDayStartUtc(now)
  for (let offset = 0; offset <= 8; offset++) {
    const dayStart = new Date(todayStart.getTime() + offset * MS_PER_DAY)
    // O instante das `startMin` NAQUELE dia civil brasileiro. Reconstruimos a
    // partir do inicio do dia em UTC + o deslocamento do fuso naquele dia, para
    // que a virada do horario de verao nao empurre a abertura em uma hora.
    const candidate = brInstantAt(dayStart, startMin)
    if (hasDays && !p.accessDays.includes(brWeekday(candidate))) continue
    if (candidate.getTime() <= now.getTime()) {
      // Ja passou a hora de abrir hoje: so serve se ainda estivermos DENTRO da
      // janela — caso em que `windowState` nem teria chamado esta funcao.
      const closes = brInstantAt(dayStart, endMin)
      if (now.getTime() < closes.getTime()) return null
      continue
    }
    return candidate
  }
  return null
}

/* ─────────────────────────────── Gotejamento ─────────────────────────────── */

/**
 * Quando a aula na posicao `position` (0-based) abre pelo gotejamento.
 *
 * A posicao e a da AULA quando `dripUnit: "LESSON"` e a do MODULO quando
 * `"MODULE"` — assim "um modulo por semana" libera todas as aulas do modulo de
 * uma vez, que e como a unidade descreve a regra.
 *
 * A primeira posicao (0) abre na matricula: cobrar `dripDays` antes da aula 1
 * faria o aluno pagar e nao ter o que assistir no dia da compra.
 */
export function dripUnlockAt(
  p: PedagogyPolicy,
  position: number,
  grantedAt: Date,
): Date {
  const steps = Math.max(0, position)
  return new Date(grantedAt.getTime() + steps * p.dripDays * MS_PER_DAY)
}

/* ──────────────────────────── Avaliacao da aula ──────────────────────────── */

export interface LessonState {
  /** Posicao da aula na ordem de reproducao (0-based). */
  index: number
  /** Posicao do modulo da aula (0-based). Usada com `dripUnit: "MODULE"`. */
  moduleIndex: number
  /** O aluno ja concluiu ESTA aula. */
  done: boolean
  /** O aluno ja concluiu a aula IMEDIATAMENTE anterior (ou esta e a primeira). */
  previousDone: boolean
  /** Quando o acesso ao curso comecou (ancora do gotejamento). */
  grantedAt: Date
  /** Aulas ja concluidas hoje, no escopo que a politica define. */
  completedToday: number
}

/**
 * A aula abre agora?
 *
 * ORDEM DE AVALIACAO — e semantica, nao estetica. A janela de horario vem
 * PRIMEIRO porque e a unica que fecha o curso inteiro: dizer "conclua a aula
 * anterior" para quem esta fora do horario manda o aluno tentar uma coisa que
 * tambem nao vai funcionar.
 *
 * REVISAO NUNCA E BARRADA. Aula ja concluida passa por todos os gates de
 * conteudo (sequencia, gotejamento, cota) — travar a revisao seria apagar o que
 * o aluno ja conquistou, e a cota diaria existe para limitar o AVANCO. A janela
 * de horario, essa sim, vale tambem para a revisao: ela e sobre QUANDO se
 * estuda, nao sobre o que ja foi estudado.
 */
export function lessonGate(
  p: PedagogyPolicy,
  s: LessonState,
  now: Date = new Date(),
): LessonGate {
  const win = windowState(p, now)
  if (!win.open) return { open: false, reason: "WINDOW", unlockAt: win.opensAt }

  if (s.done) return OPEN

  if (p.releaseMode === "SEQUENTIAL" && !s.previousDone) {
    return { open: false, reason: "SEQUENTIAL", unlockAt: null }
  }

  if (p.releaseMode === "DRIP") {
    const position = p.dripUnit === "MODULE" ? s.moduleIndex : s.index
    const at = dripUnlockAt(p, position, s.grantedAt)
    if (now < at) return { open: false, reason: "DRIP", unlockAt: at }
  }

  if (p.dailyLessonLimit !== null && s.completedToday >= p.dailyLessonLimit) {
    // Destrava na virada do dia civil brasileiro — a mesma fronteira em que
    // `completedToday` e contado. Comparar com a meia-noite UTC prometeria ao
    // aluno das 21h uma liberacao que so viria tres horas depois.
    return { open: false, reason: "DAILY_LIMIT", unlockAt: nextBrMidnight(now) }
  }

  return OPEN
}

/** Proxima meia-noite civil brasileira, em UTC. */
export function nextBrMidnight(now: Date = new Date()): Date {
  const dayStart = brDayStartUtc(now)
  return brInstantAt(new Date(dayStart.getTime() + MS_PER_DAY), 0)
}
