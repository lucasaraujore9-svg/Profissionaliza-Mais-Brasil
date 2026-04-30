import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockTenantStudents } from "@/lib/auto-block"
import { sendEmail } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"

export const maxDuration = 60
export const dynamic = "force-dynamic"

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  return bearer === secret
}

interface CancellationPolicy {
  gracePeriodDays?: number
  keepStudentsActive?: boolean
  notifyStudents?: boolean
}

const DEFAULT_GRACE_DAYS = 3

/**
 * Sweep periodico para cobrir falhas de webhook do Asaas.
 *
 * Procura tenants com mensalidade vencida ha mais de gracePeriodDays e
 * que ainda estao ACTIVE. Marca como SUSPENDED. Se billingMode=AUTO,
 * dispara blockTenantStudents (mesmo caminho do webhook PAYMENT_OVERDUE).
 *
 * E idempotente: roda quantas vezes quiser, so atua em quem nao foi
 * processado antes.
 */
async function processOverdueTenants() {
  const now = new Date()
  const result = {
    inspected: 0,
    suspended: 0,
    studentsBlocked: 0,
    errors: [] as string[],
  }

  // Tenants com pagamento OVERDUE e ainda ACTIVE
  const candidates = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
      slug: { not: "__pmb__" },
      tenantPayments: {
        some: { status: "OVERDUE" },
      },
    },
    include: {
      tenantPayments: {
        where: { status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
      owner: { select: { email: true, name: true } },
    },
  })

  result.inspected = candidates.length

  for (const tenant of candidates) {
    const overdue = tenant.tenantPayments[0]
    if (!overdue) continue

    const policy = (tenant.cancellationPolicy as CancellationPolicy | null) ?? null
    const grace = policy?.gracePeriodDays ?? DEFAULT_GRACE_DAYS
    const dueAt = overdue.dueDate.getTime()
    const ageDays = Math.floor((now.getTime() - dueAt) / (1000 * 60 * 60 * 24))

    if (ageDays < grace) continue

    try {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: "SUSPENDED" },
      })
      result.suspended += 1

      if (tenant.billingMode === "AUTO" && !policy?.keepStudentsActive) {
        const block = await blockTenantStudents(tenant.id)
        result.studentsBlocked += block.affectedStudents
        if (block.errors.length > 0) {
          result.errors.push(
            `tenant ${tenant.id}: ${block.errors.length} erro(s) bloqueando alunos`,
          )
        }
      }

      if (tenant.owner?.email) {
        await sendEmail({
          to: tenant.owner.email,
          subject: "Sua assinatura está vencida",
          template: {
            type: "payment",
            props: {
              customerName: tenant.owner.name ?? tenant.name,
              amount: Number(overdue.amount).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }),
              paymentDate: overdue.dueDate.toLocaleDateString("pt-BR"),
              description:
                tenant.billingMode === "AUTO"
                  ? "Mensalidade vencida. Seus alunos foram bloqueados até o pagamento."
                  : "Mensalidade vencida. Regularize para evitar bloqueios.",
            },
          },
        }).catch((err) => {
          console.error(`[sweep-tenants] email falhou (${tenant.id}):`, err)
        })
      }

      await createNotification({
        audience: "TENANT",
        tenantId: tenant.id,
        level: "ERROR",
        title: "Conta suspensa por inadimplência",
        body:
          tenant.billingMode === "AUTO"
            ? "Mensalidade vencida. Seus alunos foram bloqueados."
            : "Mensalidade vencida. Regularize para evitar bloqueios.",
        category: "tenant-billing",
        href: "/painel/financeiro",
      })
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: `Sweep: revendedor ${tenant.name} suspenso`,
        body: `Mensalidade vencida há ${ageDays} dia(s).`,
        category: "tenant-billing",
        href: `/admin/revendedores/${tenant.id}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.id}: ${message}`)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await processOverdueTenants()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
