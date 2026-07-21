import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import {
  pmbTenantContext,
  releaseFreeEnrollment,
  resellerTenantContext,
} from "@/lib/checkout/free-enrollment"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"

/**
 * Remediação das matrículas travadas pelo bug do cupom de 100%.
 *
 * Antes do guard de valor zero, uma venda com cupom integral criava a matrícula,
 * mandava R$ 0 ao gateway, tomava recusa e deixava a matrícula PENDING para
 * sempre — com o cupom consumido e o curso nunca liberado. O aluno ainda passava
 * a bater em DUPLICATE_ENROLLMENT em toda nova tentativa.
 *
 * Esta varredura libera essas matrículas (PENDING + finalAmount <= 0) pelo mesmo
 * caminho da bolsa. É idempotente: `fulfillScholarshipEnrollment` faz no-op em
 * matrícula já provisionada, e a query só pega PENDING.
 *
 * Roda em `dryRun` por padrão — a chamada precisa pedir explicitamente para
 * aplicar. Uma matrícula que falhar é apenas registrada; as demais seguem.
 */
export interface SweepFreeEnrollmentsResult {
  dryRun: boolean
  found: number
  released: number
  failed: number
  enrollments: Array<{
    id: string
    tenantId: string | null
    studentEmail: string | null
    courseNome: string | null
    createdAt: Date
    released: boolean
    error?: string
  }>
}

export async function sweepFreeEnrollments(
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<SweepFreeEnrollmentsResult> {
  const dryRun = opts.dryRun ?? true
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000)

  const stuck = await prisma.enrollment.findMany({
    where: { status: "PENDING", finalAmount: { lte: 0 } },
    select: {
      id: true,
      tenantId: true,
      createdAt: true,
      student: { select: { email: true } },
      course: { select: { nome: true } },
      tenant: {
        select: { id: true, slug: true, name: true, plataformaVendedorId: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })

  const result: SweepFreeEnrollmentsResult = {
    dryRun,
    found: stuck.length,
    released: 0,
    failed: 0,
    enrollments: [],
  }

  // Só resolve o tenant placeholder da PMB se houver matrícula PMB na leva.
  let pmbTenant: { id: string; slug: string } | null = null

  for (const e of stuck) {
    const base = {
      id: e.id,
      tenantId: e.tenantId,
      studentEmail: e.student?.email ?? null,
      courseNome: e.course?.nome ?? null,
      createdAt: e.createdAt,
    }

    if (dryRun) {
      result.enrollments.push({ ...base, released: false })
      continue
    }

    try {
      if (e.tenant) {
        await releaseFreeEnrollment(resellerTenantContext(e.tenant), e.id)
      } else {
        pmbTenant ??= await getOrCreatePmbTenant()
        await releaseFreeEnrollment(pmbTenantContext(pmbTenant), e.id)
      }
      result.released += 1
      result.enrollments.push({ ...base, released: true })
    } catch (err) {
      result.failed += 1
      const message = err instanceof Error ? err.message : String(err)
      result.enrollments.push({ ...base, released: false, error: message })
      contextLogger().error(
        { err, event: "sweep_free_enrollments.item_failed", enrollmentId: e.id },
        "falha ao liberar matricula de valor zero",
      )
    }
  }

  return result
}
