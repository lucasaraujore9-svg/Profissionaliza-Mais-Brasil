import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { createNotification } from "@/lib/notifications"
import {
  buildManualPaymentLines,
  competenceKey,
  ManualPaymentError,
  MAX_MANUAL_MONTHS,
  newManualPaymentId,
} from "@/lib/tenant-billing/manual-payment"
import { PAID_STATUSES } from "@/lib/tenant-billing/types"

const bodySchema = z.object({
  /** Valor de UMA mensalidade, nao o total pago. */
  amount: z.number().positive().max(1_000_000),
  months: z.number().int().min(1).max(MAX_MANUAL_MONTHS),
  /** Vencimento da PRIMEIRA mensalidade coberta (AAAA-MM-DD). */
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Quando a unidade pagou (AAAA-MM-DD). */
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional().nullable(),
})

/**
 * BAIXA FINANCEIRA MANUAL: registra mensalidade recebida FORA da plataforma.
 *
 * A cobranca do Asaas foi cancelada (PIX direto, transferencia, dinheiro), entao
 * nao existe linha para dar baixa — e sem registro a unidade fica como "nunca
 * pagou": sai da comissao de indicacao, entra no balde "Nunca ativou" do churn e
 * pode cair na trava de cortesia excepcional.
 *
 * UMA LINHA POR MES PAGO (ver lib/tenant-billing/manual-payment.ts): tres
 * mensalidades adiantadas viram tres linhas nas competencias delas, e nao um
 * lancamento somado — senao a comissao sairia por um mes so e a varredura de
 * inadimplencia suspenderia a unidade nos meses que ela ja pagou.
 *
 * MES QUE JA TEM MENSALIDADE PAGA E PULADO, nao duplicado. Lancar de novo o mes
 * pago criaria receita que nao existe e uma segunda faixa de comissao para o
 * indicador. A resposta diz quais foram criadas e quais foram puladas, para o
 * financeiro ver o que aconteceu em vez de descobrir depois no relatorio.
 */
export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "admin.revendedores.pagamento_manual",
    route: "/api/admin/revendedores/[id]/pagamento-manual",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("financeiro.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx
    const { id } = await context.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      // `accountManagerId`/`salesUserId` sao o que `canAccessTenant` le para o
      // recorte de carteira — o compilador exige os dois no select.
      select: {
        id: true,
        name: true,
        planValue: true,
        accountManagerId: true,
        salesUserId: true,
      },
    })
    // 403 mesmo quando nao existe — nao revela unidade fora da carteira.
    if (!tenant || !(await ctx.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let lines
    try {
      lines = buildManualPaymentLines({
        amount: parsed.data.amount,
        months: parsed.data.months,
        firstDueDate: new Date(`${parsed.data.firstDueDate}T00:00:00.000Z`),
        paidAt: new Date(`${parsed.data.paidAt}T00:00:00.000Z`),
      })
    } catch (err) {
      if (err instanceof ManualPaymentError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        )
      }
      throw err
    }

    // Competencias que a unidade JA tem pagas — inclui a baixa manual anterior
    // (`markedPaidAt`) e o pagamento normal, pelo mesmo predicado que o motor de
    // comissao usa para "pagou no mes".
    const jaPagos = await prisma.tenantPayment.findMany({
      where: {
        tenantId: id,
        competenceAt: { not: null },
        OR: [
          { status: { in: [...PAID_STATUSES] } },
          { markedPaidAt: { not: null } },
          { paidAt: { not: null } },
        ],
      },
      select: { competenceAt: true },
    })
    const ocupadas = new Set(
      jaPagos
        .map((p) => p.competenceAt)
        .filter((d): d is Date => d !== null)
        .map(competenceKey),
    )

    const paidAt = new Date(`${parsed.data.paidAt}T00:00:00.000Z`)
    const agora = new Date()
    const criar = lines.filter((l) => !ocupadas.has(competenceKey(l.competenceAt)))
    const pulados = lines
      .filter((l) => ocupadas.has(competenceKey(l.competenceAt)))
      .map((l) => competenceKey(l.competenceAt))

    if (criar.length === 0) {
      return NextResponse.json(
        {
          error:
            "Todas as competências informadas já têm mensalidade paga. Nada foi lançado.",
          code: "ALREADY_PAID",
          skipped: pulados,
        },
        { status: 409 },
      )
    }

    const nota = parsed.data.note?.trim()
    const autor = ctx.name ?? ctx.email ?? "Admin"
    const baseNota = `Baixa manual: mensalidade recebida fora da plataforma.${nota ? ` ${nota}` : ""}`

    // Sequencial e nao `$transaction([...])`: o lote em array cai sobre o pooler
    // do Supabase (ver historico do projeto) e aqui sao no maximo 12 linhas.
    const criadas: { id: string; competencia: string; dueDate: string }[] = []
    for (const linha of criar) {
      const row = await prisma.tenantPayment.create({
        data: {
          tenantId: id,
          // Id sintetico: nao existe cobranca no Asaas. `isManualPayment` e o
          // que faz quem fala com o gateway pular esta linha em vez de tomar 404.
          asaasPaymentId: newManualPaymentId(),
          amount: linha.amount,
          billingType: "MANUAL",
          // RECEIVED e nao RECEIVED_IN_CASH: e o status que TODO o sistema le
          // como pago (painel da unidade, lembretes, inadimplencia, comissao).
          // O que marca a natureza manual e `markedPaidAt` + o id sintetico.
          status: "RECEIVED",
          dueDate: linha.dueDate,
          paidAt,
          clientPaidAt: paidAt,
          competenceAt: linha.competenceAt,
          markedPaidAt: agora,
          markedPaidById: ctx.userId,
          notes: `[${agora.toLocaleString("pt-BR")}] ${autor}: ${baseNota}`,
        },
        select: { id: true },
      })
      criadas.push({
        id: row.id,
        competencia: competenceKey(linha.competenceAt),
        dueDate: linha.dueDate.toISOString().slice(0, 10),
      })
    }

    await logAudit({
      action: "tenant_payment.manual_settle",
      resource: "tenant_payment",
      resourceId: id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      tenantId: id,
      payloadAfter: {
        unidade: tenant.name,
        valorMensalidade: parsed.data.amount,
        mensalidades: criadas.length,
        competencias: criadas.map((c) => c.competencia),
        puladas: pulados,
        pagoEm: parsed.data.paidAt,
        nota: nota ?? null,
      },
    }).catch(swallow("admin.revendedores.pagamento_manual"))

    // A baixa manual tira a unidade de "nunca pagou" sem dinheiro nenhum passar
    // por gateway — mesmo alerta do `mark-paid`, e SEM `category` para nao poder
    // ser silenciado por preferencia de notificacao.
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: `Baixa manual de mensalidade: ${tenant.name}`,
      body: `${criadas.length} mensalidade(s) de R$ ${parsed.data.amount.toFixed(2).replace(".", ",")} registradas como recebidas fora da plataforma (competências ${criadas.map((c) => c.competencia).join(", ")}), por ${autor}.`,
      href: `/admin/revendedores/${id}`,
    }).catch(swallow("admin.revendedores.pagamento_manual"))

    return NextResponse.json({
      data: {
        created: criadas,
        skipped: pulados,
        total: criadas.length * parsed.data.amount,
      },
    })
  },
)
