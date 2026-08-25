import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import {
  findPersonStudentIds,
  releaseScheduleMarkKeepingBlock,
  setStudentScheduleBlock,
} from "@/lib/students/plataforma-actions"
import { windowState } from "./gate"
import { parsePolicy, resolvePolicy, type PedagogyPolicy } from "./policy"

/**
 * JANELA DE HORARIO na fornecedora legada (EA).
 *
 * ⚠️ LEIA ISTO ANTES DE MEXER. Dos tres eixos pedagogicos, este e o UNICO que
 * alcanca a EA — e alcanca MAL, por limitacao dela, nao por escolha nossa:
 *
 *   • A EA nao tem gate por aula. O unico controle e `usuarios/editar` com
 *     status ativo/bloqueado, entao "horario" so pode significar "o login abre
 *     ou nao abre".
 *   • O login e POR PESSOA e compartilhado entre unidades (regra de negocio: um
 *     usuario por CPF). Travar por causa de UMA unidade derruba os cursos que a
 *     pessoa tem em OUTRAS — inclusive quitados.
 *   • Nao ha "quantas aulas hoje" na EA: a cota diaria e o modo sequencial NAO
 *     tem como ser aplicados la. So a janela.
 *
 * Dai a politica conservadora abaixo, copiada de `shouldCutPlatformAccess`
 * (pace.ts): so trava quando NENHUMA matricula viva da pessoa esta dentro da
 * janela dela. Na duvida, ninguem e travado — devolver acesso indevido por uma
 * hora custa menos que cortar quem pagou.
 *
 * Nos cursos da plataforma propria a janela e aplicada AULA A AULA pelo proprio
 * LMS, que e mais fino. Este modulo nao toca em LMS nenhum.
 */

interface Candidate {
  studentId: string
  /** Politica efetiva de cada matricula viva da pessoa que esta na EA. */
  policies: PedagogyPolicy[]
  /** A pessoa tem alguma matricula viva SEM janela (ou fora da EA)? */
  hasUnrestricted: boolean
}

export interface WindowSweepResult {
  avaliados: number
  bloqueados: number
  liberados: number
  entreguesAOutraCamada: number
  erros: string[]
}

/** Uma politica so alcanca a EA se restringir HORARIO. */
function hasWindow(p: PedagogyPolicy): boolean {
  return p.accessDays.length > 0 || p.accessStartMin !== null || p.accessEndMin !== null
}

/**
 * Varre as unidades com janela de horario configurada e ajusta o acesso na EA.
 *
 * `dryRun` calcula tudo e nao escreve nada — e como se confere o alcance real
 * antes da primeira execucao, no mesmo molde do `?dryRun=1` do cancelamento por
 * inadimplencia.
 */
export async function runScheduleWindowSweep(
  now: Date = new Date(),
  dryRun = false,
): Promise<WindowSweepResult> {
  const log = contextLogger().child({ action: "pedagogia.janela" })
  const out: WindowSweepResult = {
    avaliados: 0,
    bloqueados: 0,
    liberados: 0,
    entreguesAOutraCamada: 0,
    erros: [],
  }

  // 1) Unidades com politica de horario. Sem nenhuma, o job acaba aqui — que e
  //    o estado esperado enquanto ninguem configurou.
  const tenants = await prisma.tenant.findMany({
    where: { pedagogyPolicy: { not: Prisma.DbNull } },
    select: { id: true, pedagogyPolicy: true },
  })
  const tenantPolicy = new Map<string, PedagogyPolicy>()
  for (const t of tenants) tenantPolicy.set(t.id, parsePolicy(t.pedagogyPolicy))

  // Overrides por curso podem introduzir janela numa unidade que nao tem, e
  // remove-la de um curso numa que tem. Carregados junto para a decisao ser
  // sempre a politica EFETIVA daquela matricula.
  const overrides = await prisma.tenantCourse.findMany({
    where: { pedagogyPolicy: { not: Prisma.DbNull } },
    select: { tenantId: true, courseId: true, pedagogyPolicy: true },
  })
  const overrideKey = (t: string, c: string) => `${t}:${c}`
  const courseOverride = new Map<string, unknown>()
  for (const o of overrides) courseOverride.set(overrideKey(o.tenantId, o.courseId), o.pedagogyPolicy)

  if (tenantPolicy.size === 0 && courseOverride.size === 0) return out

  // 2) Matriculas vivas de curso da EA nessas unidades. So a EA: o LMS aplica a
  //    janela sozinho, aula a aula.
  const tenantIds = [...new Set([...tenantPolicy.keys(), ...overrides.map((o) => o.tenantId)])]
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { provider: "EA" },
    },
    select: { studentId: true, tenantId: true, courseId: true },
  })
  if (enrollments.length === 0) return out

  // 3) Agrupa por ALUNO e resolve a politica de cada matricula.
  const byStudent = new Map<string, Candidate>()
  for (const e of enrollments) {
    const policy = resolvePolicy(
      e.tenantId ? tenantPolicy.get(e.tenantId) : null,
      e.tenantId ? courseOverride.get(overrideKey(e.tenantId, e.courseId)) ?? null : null,
    )
    const c = byStudent.get(e.studentId) ?? {
      studentId: e.studentId,
      policies: [],
      hasUnrestricted: false,
    }
    if (hasWindow(policy)) c.policies.push(policy)
    else c.hasUnrestricted = true
    byStudent.set(e.studentId, c)
  }

  for (const candidate of byStudent.values()) {
    out.avaliados += 1
    try {
      const change = await evaluateStudent(candidate, now)
      if (!change) continue
      if (dryRun) {
        if (change === "block") out.bloqueados += 1
        else if (change === "release") out.liberados += 1
        else out.entreguesAOutraCamada += 1
        continue
      }
      if (change === "handoff") {
        await releaseScheduleMarkKeepingBlock(candidate.studentId)
        out.entreguesAOutraCamada += 1
        continue
      }
      const applied = await setStudentScheduleBlock(candidate.studentId, change === "block")
      if (applied) {
        if (change === "block") out.bloqueados += 1
        else out.liberados += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido"
      out.erros.push(`student ${candidate.studentId}: ${msg}`)
      log.error(
        { err, event: "pedagogia.janela.student_failed", studentId: candidate.studentId },
        "ajuste da janela de horario falhou — a proxima varredura re-tenta",
      )
    }
  }

  log.info({ event: "pedagogia.janela.done", dryRun, ...out }, "varredura da janela de horario")
  return out
}

type Change = "block" | "release" | "handoff" | null

/**
 * O que fazer com este aluno agora.
 *
 * `handoff` = ele esta travado por NOS, mas surgiu um motivo mais forte
 * (unidade suspensa/cancelada, ou cota de aulas) enquanto isso. Soltamos a
 * marca e deixamos o bloqueio de pe: liberar seria devolver acesso a quem outra
 * regra ja tinha decidido cortar, e essa outra regra nao vai re-decidir tao
 * cedo porque as varreduras dela PULAM quem ja esta BLOQUEADO.
 */
async function evaluateStudent(c: Candidate, now: Date): Promise<Change> {
  const student = await prisma.student.findUnique({
    where: { id: c.studentId },
    select: { status: true, scheduleBlockedAt: true, plataformaAlunoId: true },
  })
  if (!student || student.plataformaAlunoId === null) return null

  const travadoPorNos = student.scheduleBlockedAt !== null

  // Deveria estar fora do ar? So quando TODA matricula viva da pessoa esta fora
  // da janela dela. Uma unica aberta ja cancela o corte — a pessoa tem um curso
  // legitimamente liberado agora, e o login e um so.
  const foraDeTudo =
    !c.hasUnrestricted &&
    c.policies.length > 0 &&
    c.policies.every((p) => !windowState(p, now).open) &&
    !(await personHasOpenElsewhere(c.studentId, now))

  if (travadoPorNos) {
    if (foraDeTudo) return null // segue travado, nada a fazer
    return (await hasStrongerBlock(c.studentId)) ? "handoff" : "release"
  }
  if (!foraDeTudo) return null
  // Nao rebaixamos quem ja esta sob trava mais forte.
  return student.status === "ATIVO" ? "block" : null
}

/**
 * A MESMA PESSOA (mesmo login na EA) tem curso liberado em outra unidade agora?
 *
 * O login e por CPF/e-mail e reaproveitado entre revendas — `findPersonStudentIds`
 * e a mesma funcao que a cota de aulas usa por este exato motivo. Sem esta
 * consulta, a unidade A fecharia as 18:00 e derrubaria junto os cursos que a
 * pessoa cursa na unidade B, que nem tem janela.
 */
async function personHasOpenElsewhere(studentId: string, now: Date): Promise<boolean> {
  const personIds = await findPersonStudentIds(studentId)
  const others = personIds.filter((id) => id !== studentId)
  if (others.length === 0) return false

  const siblings = await prisma.enrollment.findMany({
    where: {
      studentId: { in: others },
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { provider: "EA" },
    },
    select: {
      tenantId: true,
      courseId: true,
      tenant: { select: { pedagogyPolicy: true } },
      tenantCourse: { select: { pedagogyPolicy: true } },
    },
  })

  return siblings.some((s) => {
    const p = resolvePolicy(s.tenant?.pedagogyPolicy, s.tenantCourse?.pedagogyPolicy)
    // Sem janela = sempre aberto.
    return !hasWindow(p) || windowState(p, now).open
  })
}

/**
 * Existe motivo MAIS FORTE para o aluno seguir bloqueado?
 *
 * Duas fontes, as duas verificadas contra o estado ATUAL (nao contra o que
 * estava quando travamos): unidade fora do ar e cota de aulas. Sao exatamente
 * as camadas cujas varreduras pulam quem ja esta BLOQUEADO — por isso somos nos
 * que precisamos perguntar.
 */
async function hasStrongerBlock(studentId: string): Promise<boolean> {
  const [student, paceBlocked] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { tenant: { select: { status: true } } },
    }),
    prisma.enrollment.count({
      where: {
        studentId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        paceBlockedAt: { not: null },
        paceExemptAt: null,
      },
    }),
  ])
  const tenantStatus = student?.tenant?.status
  if (tenantStatus === "SUSPENDED" || tenantStatus === "CANCELLED") return true
  return paceBlocked > 0
}
