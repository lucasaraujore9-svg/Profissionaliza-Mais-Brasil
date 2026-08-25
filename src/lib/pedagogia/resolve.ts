import "server-only"
import { prisma } from "@/lib/prisma"
import { DEFAULT_POLICY, parsePolicy, resolvePolicy, type PedagogyPolicy } from "./policy"

/**
 * Leitura das regras pedagogicas do banco. O unico modulo do PMB que sabe ONDE
 * a politica mora — o resto do sistema recebe um `PedagogyPolicy` pronto.
 *
 * Precedencia: `TenantCourse.pedagogyPolicy` (override daquela vitrine) vence
 * `Tenant.pedagogyPolicy` (padrao da unidade). Ver `resolvePolicy`.
 */

/** Politica efetiva de um curso numa vitrine. */
export async function policyForTenantCourse(
  tenantId: string,
  courseId: string,
): Promise<PedagogyPolicy> {
  const [tenant, tc] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { pedagogyPolicy: true },
    }),
    prisma.tenantCourse.findUnique({
      where: { tenantId_courseId: { tenantId, courseId } },
      select: { pedagogyPolicy: true },
    }),
  ])
  return resolvePolicy(tenant?.pedagogyPolicy, tc?.pedagogyPolicy)
}

/**
 * Politica efetiva de uma MATRICULA.
 *
 * `tenantId` null e a vitrine PMB: ela nao tem politica pedagogica propria
 * (as regras sao um recurso da UNIDADE), entao cai no default aberto. Nao
 * herdar do tenant placeholder `__pmb__` e deliberado — ele existe para
 * pendurar `Student`, nao para carregar politica comercial.
 */
export async function policyForEnrollment(enrollmentId: string): Promise<PedagogyPolicy> {
  const e = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      courseId: true,
      tenantId: true,
      tenant: { select: { pedagogyPolicy: true } },
      tenantCourse: { select: { pedagogyPolicy: true } },
    },
  })
  if (!e || !e.tenantId) return DEFAULT_POLICY
  return resolvePolicy(e.tenant?.pedagogyPolicy, e.tenantCourse?.pedagogyPolicy)
}

/** Politica padrao da unidade (a tela de configuracao e o push ao LMS). */
export async function policyForTenant(tenantId: string): Promise<PedagogyPolicy> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { pedagogyPolicy: true },
  })
  return parsePolicy(t?.pedagogyPolicy)
}
