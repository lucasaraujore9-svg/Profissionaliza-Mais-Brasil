import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { isLmsConfigured, putLmsTenantBranding, setLmsEnrollmentPolicy } from "@/lib/lms"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"
import { parsePolicy, type PedagogyPolicy } from "./policy"
import { lmsEnrollmentPolicyBody } from "./order-override"

/**
 * Propagacao das REGRAS PEDAGOGICAS ao LMS.
 *
 * A regra e definida aqui e APLICADA la — o LMS e quem conhece a grade e decide
 * aula a aula. Salvar sem propagar deixaria a unidade olhando uma tela que
 * promete uma coisa e um aluno vivendo outra, sem nenhum erro em lugar nenhum:
 * o pior tipo de defeito desta feature, e o mesmo formato do split esquecido
 * em `asaasSplitsForEnrollment`.
 *
 * Dois niveis, pela mesma razao de o LMS guardar dois:
 *   • UNIDADE — uma chamada (`PUT /tenants/:id`) alcanca todo o catalogo dela.
 *   • CURSO   — override; alcanca as matriculas VIVAS daquele curso, uma a uma.
 */

/** Serializa a politica no formato que viaja para o LMS. */
function wire(p: PedagogyPolicy): Record<string, unknown> {
  return { ...p }
}

/**
 * Empurra a politica PADRAO da unidade. Best-effort e NUNCA lanca: a regra ja
 * foi gravada no nosso banco (a fonte da verdade) e a tela nao pode falhar
 * porque a plataforma de aulas piscou. O que a falha custa e o atraso ate a
 * proxima escrita — por isso ela e LOGADA em nivel de erro, nao de aviso.
 */
export async function syncTenantPedagogyToLms(
  tenant: { id: string; slug: string },
  policy: PedagogyPolicy,
): Promise<boolean> {
  if (!isLmsConfigured()) return false
  // A vitrine PMB nao tem regra pedagogica: elas sao um recurso da UNIDADE, e
  // `__pmb__` e um tenant placeholder que existe para pendurar `Student`.
  if (tenant.slug === PMB_TENANT_SLUG) return false
  try {
    await putLmsTenantBranding(tenant.id, { pedagogy: wire(policy) })
  } catch (err) {
    contextLogger().error(
      { err, event: "pedagogia.sync_tenant_failed", tenantId: tenant.id },
      "propagacao das regras pedagogicas da unidade a plataforma de aulas falhou",
    )
    return false
  }
  return true
}

/**
 * Matricula com ORDEM propria guarda no LMS a politica RESOLVIDA inteira (um
 * bloco so por matricula), entao nao herda o `PUT /tenants/:id`: sem re-empurrar,
 * a cota e o horario novos da unidade nunca chegariam a esses alunos.
 *
 * Separado de `syncTenantPedagogyToLms` porque roda matricula a matricula (com
 * retry do client em cada uma) — o chamador o joga em `afterResponse` para a
 * tela da unidade nao ficar pendurada. Falha e logada por matricula.
 */
export async function syncOverriddenEnrollmentsToLms(
  tenantId: string,
  policy: PedagogyPolicy,
): Promise<CourseSyncResult> {
  const out: CourseSyncResult = { matched: 0, pushed: 0, failed: 0 }
  if (!isLmsConfigured()) return out
  const overridden = await prisma.enrollment.findMany({
    where: {
      tenantId,
      pedagogyOrder: { not: Prisma.DbNull },
      lmsEnrollmentId: { not: null },
      status: POLICY_SYNC_STATUS,
    },
    select: { id: true, courseId: true, lmsEnrollmentId: true, pedagogyOrder: true },
  })
  out.matched = overridden.length
  if (overridden.length === 0) return out
  const tcs = await prisma.tenantCourse.findMany({
    where: { tenantId, courseId: { in: [...new Set(overridden.map((e) => e.courseId))] } },
    select: { courseId: true, pedagogyPolicy: true },
  })
  const coursePolicy = new Map(tcs.map((t) => [t.courseId, t.pedagogyPolicy]))
  for (const e of overridden) {
    const body = lmsEnrollmentPolicyBody(policy, coursePolicy.get(e.courseId), e.pedagogyOrder)
    if (await pushEnrollment(e, body)) out.pushed += 1
    else out.failed += 1
  }
  return out
}

/**
 * Matriculas que recebem a regra: tudo menos CANCELLED — o MESMO recorte da rota
 * que grava a ordem por matricula. Uma SUSPENDED volta a ACTIVE sozinha ao
 * pagar, e se ficasse fora da propagacao voltaria com a regra velha.
 */
const POLICY_SYNC_STATUS = { not: "CANCELLED" as const }

/** Um PATCH por matricula; falha e logada e nao interrompe as demais. */
async function pushEnrollment(
  e: { id: string; lmsEnrollmentId: string | null },
  body: Record<string, unknown> | null,
): Promise<boolean> {
  try {
    await setLmsEnrollmentPolicy(e.lmsEnrollmentId!, body)
    return true
  } catch (err) {
    contextLogger().error(
      { err, event: "pedagogia.sync_enrollment_failed", enrollmentId: e.id },
      "propagacao das regras pedagogicas de uma matricula falhou",
    )
    return false
  }
}

export interface CourseSyncResult {
  matched: number
  pushed: number
  failed: number
}

/**
 * Empurra o override de UM curso para as matriculas vivas dele naquela vitrine.
 *
 * Por que matricula a matricula, e nao um endpoint "curso": o LMS guarda a
 * politica por MATRICULA justamente porque o mesmo curso e vendido por varias
 * unidades, com ritmos diferentes. Um endpoint por curso teria que reconstruir
 * a precedencia do nosso lado de la — duplicando a decisao.
 *
 * So matricula com `lmsEnrollmentId` entra: as da fornecedora legada nao tem
 * onde receber a regra (ver a nota de escopo em `Tenant.pedagogyPolicy`).
 *
 * O `null` explicito e importante: quando a unidade REMOVE o override do curso,
 * as matriculas precisam voltar a herdar o padrao dela. Sem esta chamada, elas
 * ficariam congeladas na regra antiga para sempre.
 */
export async function syncCoursePedagogyToLms(
  tenantId: string,
  courseId: string,
): Promise<CourseSyncResult> {
  const out: CourseSyncResult = { matched: 0, pushed: 0, failed: 0 }
  if (!isLmsConfigured()) return out

  const [tenant, tc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { pedagogyPolicy: true, slug: true } }),
    prisma.tenantCourse.findUnique({
      where: { tenantId_courseId: { tenantId, courseId } },
      select: { pedagogyPolicy: true },
    }),
  ])
  if (!tenant || tenant.slug === PMB_TENANT_SLUG) return out

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId,
      courseId,
      lmsEnrollmentId: { not: null },
      status: POLICY_SYNC_STATUS,
    },
    select: { id: true, lmsEnrollmentId: true, pedagogyOrder: true },
  })
  out.matched = enrollments.length

  for (const e of enrollments) {
    // `null` no curso (e sem ordem propria na matricula) significa HERDAR — e
    // herdar, no LMS, se diz mandando `null` (limpa o override da matricula).
    // Nao e o mesmo que mandar a politica da unidade resolvida: assim, editar o
    // padrao da unidade depois alcanca estas matriculas sem varrer curso a curso.
    const body = lmsEnrollmentPolicyBody(tenant.pedagogyPolicy, tc?.pedagogyPolicy, e.pedagogyOrder)
    if (await pushEnrollment(e, body)) out.pushed += 1
    else out.failed += 1
  }
  return out
}

/**
 * Politica que uma matricula NOVA leva ao LMS no ato do provisionamento.
 *
 * Devolve `null` quando o curso nao tem override — a matricula nasce herdando o
 * padrao da unidade, que ja esta la. Mandar a politica resolvida aqui seria um
 * congelamento silencioso: a unidade editaria o proprio padrao e as matriculas
 * criadas antes ficariam na regra velha.
 */
export async function pedagogyForNewEnrollment(
  tenantId: string | null,
  courseId: string,
  /** Matricula ja existente sendo (re)provisionada — ex.: "Retomar" da assinatura. */
  enrollmentId?: string,
): Promise<Record<string, unknown> | null> {
  if (!tenantId) return null
  const [tc, e] = await Promise.all([
    prisma.tenantCourse.findUnique({
      where: { tenantId_courseId: { tenantId, courseId } },
      select: { pedagogyPolicy: true },
    }),
    enrollmentId
      ? prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { pedagogyOrder: true } })
      : null,
  ])
  // Ordem propria da matricula: sem isto, reprovisionar (nova matricula no LMS)
  // perderia a troca que a unidade fez para este aluno.
  if (e?.pedagogyOrder != null) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pedagogyPolicy: true } })
    return lmsEnrollmentPolicyBody(tenant?.pedagogyPolicy, tc?.pedagogyPolicy, e.pedagogyOrder)
  }
  if (tc?.pedagogyPolicy == null) return null
  // A politica da UNIDADE nao entra: o override vence INTEIRO (`resolvePolicy`),
  // entao busca-la seria uma consulta a mais no caminho de toda venda para um
  // valor que seria descartado.
  return wire(parsePolicy(tc.pedagogyPolicy))
}

export { parsePolicy }
