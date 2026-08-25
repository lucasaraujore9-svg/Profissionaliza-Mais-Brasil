import { z } from "zod"
import { MAX_DAILY_LESSONS, MAX_DRIP_DAYS, parsePolicy, type PedagogyPolicy } from "./policy"

/**
 * Validacao de ENTRADA das regras pedagogicas (formulario do painel).
 *
 * Difere de `parsePolicy` de proposito, e a diferenca importa: `parsePolicy`
 * NORMALIZA silenciosamente o que ja esta no banco (nunca lanca, sempre resolve
 * para o lado menos restritivo); este schema RECUSA o que a pessoa digitou
 * errado, com mensagem. Aceitar calado uma janela invertida faria a unidade
 * salvar "das 22h as 2h", ver a tela dizer que salvou e nao travar ninguem.
 */

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário inválido (use HH:MM)")

/** "HH:MM" -> minutos desde a meia-noite. */
export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number)
  return h * 60 + m
}

/** Minutos -> "HH:MM" (o formulario le assim). */
export function minutesToHhmm(v: number | null): string {
  if (v === null) return ""
  if (v >= 1440) return "23:59"
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`
}

export const pedagogyInputSchema = z
  .object({
    releaseMode: z.enum(["FREE", "SEQUENTIAL", "DRIP"]),
    dripDays: z.number().int().min(1).max(MAX_DRIP_DAYS),
    dripUnit: z.enum(["LESSON", "MODULE"]),
    // `null` = sem cota. O formulario manda null quando o campo esta vazio.
    dailyLessonLimit: z.number().int().min(1).max(MAX_DAILY_LESSONS).nullable(),
    quotaScope: z.enum(["COURSE", "STUDENT"]),
    accessDays: z.array(z.number().int().min(0).max(6)).max(7),
    accessStart: hhmm.or(z.literal("")).nullable(),
    accessEnd: hhmm.or(z.literal("")).nullable(),
  })
  .superRefine((v, ctx) => {
    const start = v.accessStart ? hhmmToMinutes(v.accessStart) : null
    const end = v.accessEnd ? hhmmToMinutes(v.accessEnd) : null
    if (start !== null && end !== null && end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["accessEnd"],
        // A janela nao cruza a meia-noite: "22:00 as 02:00" exigiria decidir a
        // qual dia da semana a madrugada pertence, pergunta que esta tela nao
        // faz e que a unidade responderia diferente de nos.
        message: "o fim precisa ser depois do início (a janela não vira o dia)",
      })
    }
    // Nenhum dia marcado com horario definido travaria o aluno para SEMPRE. A
    // tela trata "todos os dias" como nenhum marcado, entao isto so acontece se
    // a pessoa desmarcar os sete — e ai o certo e explicar, nao salvar.
    if (v.accessDays.length === 0 && (start !== null || end !== null)) {
      // Sem dias marcados = todos os dias. Nao e erro: e o default.
    }
  })

export type PedagogyInput = z.infer<typeof pedagogyInputSchema>

/** Forma do formulario -> forma guardada/aplicada. */
export function inputToPolicy(v: PedagogyInput): PedagogyPolicy {
  return parsePolicy({
    releaseMode: v.releaseMode,
    dripDays: v.dripDays,
    dripUnit: v.dripUnit,
    dailyLessonLimit: v.dailyLessonLimit,
    quotaScope: v.quotaScope,
    accessDays: v.accessDays,
    accessStartMin: v.accessStart ? hhmmToMinutes(v.accessStart) : null,
    accessEndMin: v.accessEnd ? hhmmToMinutes(v.accessEnd) : null,
  })
}

/** Forma guardada -> forma do formulario. */
export function policyToInput(p: PedagogyPolicy): PedagogyInput {
  return {
    releaseMode: p.releaseMode,
    dripDays: p.dripDays,
    dripUnit: p.dripUnit,
    dailyLessonLimit: p.dailyLessonLimit,
    quotaScope: p.quotaScope,
    accessDays: p.accessDays,
    accessStart: minutesToHhmm(p.accessStartMin),
    accessEnd: minutesToHhmm(p.accessEndMin),
  }
}
