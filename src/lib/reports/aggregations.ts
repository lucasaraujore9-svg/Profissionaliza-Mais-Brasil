import { prisma } from "@/lib/prisma"
import type { Bucket } from "./period"

/**
 * Helpers de agregação compartilhados pelos módulos de BI (admin + painel).
 * Centralizam as séries temporais via `date_trunc` para que a visão diária e a
 * de BI usem a MESMA matemática (evita drift de métricas).
 *
 * Segurança: `bucket` é validado contra whitelist antes de ir para o SQL; os
 * demais valores (datas, tenantId) são passados como parâmetros ($N).
 */

const VALID_BUCKETS: Bucket[] = ["hour", "day", "week", "month"]

function safeBucket(bucket: Bucket): Bucket {
  if (!VALID_BUCKETS.includes(bucket)) throw new Error(`bucket inválido: ${bucket}`)
  return bucket
}

export type Segment = "pmb" | "revenda" | "todos"

interface SeriesRow {
  bucket: Date
  value: number
}

function tenantCondition(
  args: unknown[],
  tenantId: string | null | undefined,
  segment: Segment | undefined,
): string {
  if (tenantId !== undefined && tenantId !== null) {
    args.push(tenantId)
    return `AND tenant_id = $${args.length}`
  }
  if (segment === "pmb") return "AND tenant_id IS NULL"
  if (segment === "revenda") return "AND tenant_id IS NOT NULL"
  return ""
}

/** Receita (pagamentos APROVADOS) somada por bucket de `paid_at`. */
export async function approvedRevenueByBucket(params: {
  start: Date
  end: Date
  bucket: Bucket
  tenantId?: string | null
  segment?: Segment
}): Promise<SeriesRow[]> {
  const bucket = safeBucket(params.bucket)
  const args: unknown[] = [bucket, params.start, params.end]
  const tenant = tenantCondition(args, params.tenantId, params.segment)
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; value: number }[]>(
    `SELECT date_trunc($1, paid_at) AS bucket,
            COALESCE(SUM(amount), 0)::float AS value
       FROM payments
      WHERE mp_status = 'APPROVED'
        AND paid_at >= $2
        AND paid_at < $3
        ${tenant}
      GROUP BY 1
      ORDER BY 1 ASC`,
    ...args,
  )
  return rows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) }))
}

/** Contagem de matrículas por bucket de `created_at`. */
export async function enrollmentCountByBucket(params: {
  start: Date
  end: Date
  bucket: Bucket
  tenantId?: string | null
  segment?: Segment
}): Promise<SeriesRow[]> {
  const bucket = safeBucket(params.bucket)
  const args: unknown[] = [bucket, params.start, params.end]
  const tenant = tenantCondition(args, params.tenantId, params.segment)
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; value: bigint }[]>(
    `SELECT date_trunc($1, created_at) AS bucket,
            COUNT(*)::bigint AS value
       FROM enrollments
      WHERE created_at >= $2
        AND created_at < $3
        ${tenant}
      GROUP BY 1
      ORDER BY 1 ASC`,
    ...args,
  )
  return rows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) }))
}

/** Contagem de alunos novos por bucket de `created_at`. */
export async function studentCountByBucket(params: {
  start: Date
  end: Date
  bucket: Bucket
  tenantId?: string | null
}): Promise<SeriesRow[]> {
  const bucket = safeBucket(params.bucket)
  const args: unknown[] = [bucket, params.start, params.end]
  const tenant = tenantCondition(args, params.tenantId, undefined)
  const rows = await prisma.$queryRawUnsafe<{ bucket: Date; value: bigint }[]>(
    `SELECT date_trunc($1, created_at) AS bucket,
            COUNT(*)::bigint AS value
       FROM students
      WHERE created_at >= $2
        AND created_at < $3
        ${tenant}
      GROUP BY 1
      ORDER BY 1 ASC`,
    ...args,
  )
  return rows.map((r) => ({ bucket: new Date(r.bucket), value: Number(r.value) }))
}

/** Receita total (pagamentos aprovados) num intervalo — escopável por segmento/tenant. */
export async function approvedRevenueTotal(params: {
  start: Date
  end: Date
  tenantId?: string | null
  segment?: Segment
}): Promise<number> {
  const where: Record<string, unknown> = {
    mpStatus: "APPROVED",
    paidAt: { gte: params.start, lt: params.end },
  }
  if (params.tenantId !== undefined && params.tenantId !== null) where.tenantId = params.tenantId
  else if (params.segment === "pmb") where.tenantId = null
  else if (params.segment === "revenda") where.tenantId = { not: null }
  const agg = await prisma.payment.aggregate({ _sum: { amount: true }, where })
  return Number(agg._sum.amount ?? 0)
}
