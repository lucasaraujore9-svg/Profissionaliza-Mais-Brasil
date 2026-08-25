import "server-only"
import { prisma } from "@/lib/prisma"
import { isLmsConfigured, putLmsTenantBranding, setLmsEnrollmentPolicy } from "@/lib/lms"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"
import { parsePolicy, resolvePolicy, type PedagogyPolicy } from "./policy"

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
    return true
  } catch (err) {
    contextLogger().error(
      { err, event: "pedagogia.sync_tenant_failed", tenantId: tenant.id },
      "propagacao das regras pedagogicas da unidade a plataforma de aulas falhou",
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

  // `null` no curso significa HERDAR — e herdar, no LMS, se diz mandando `null`
  // (limpa o override da matricula). Nao e o mesmo que mandar a politica da
  // unidade resolvida: assim, editar o padrao da unidade depois alcanca estas
  // matriculas sem precisar varrer curso por curso de novo.
  const body =
    tc?.pedagogyPolicy == null
      ? null
      : wire(resolvePolicy(tenant.pedagogyPolicy, tc.pedagogyPolicy))

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId,
      courseId,
      lmsEnrollmentId: { not: null },
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: { id: true, lmsEnrollmentId: true },
  })
  out.matched = enrollments.length

  for (const e of enrollments) {
    try {
      await setLmsEnrollmentPolicy(e.lmsEnrollmentId!, body)
      out.pushed += 1
    } catch (err) {
      out.failed += 1
      contextLogger().error(
        { err, event: "pedagogia.sync_enrollment_failed", enrollmentId: e.id },
        "propagacao das regras pedagogicas de uma matricula falhou",
      )
    }
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
): Promise<Record<string, unknown> | null> {
  if (!tenantId) return null
  const tc = await prisma.tenantCourse.findUnique({
    where: { tenantId_courseId: { tenantId, courseId } },
    select: { pedagogyPolicy: true },
  })
  if (tc?.pedagogyPolicy == null) return null
  // A politica da UNIDADE nao entra: o override vence INTEIRO (`resolvePolicy`),
  // entao busca-la seria uma consulta a mais no caminho de toda venda para um
  // valor que seria descartado.
  return wire(parsePolicy(tc.pedagogyPolicy))
}

export { parsePolicy }
