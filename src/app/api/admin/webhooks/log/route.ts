import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * GET /api/admin/webhooks/log — log dos disparos, nos dois sentidos.
 *
 *   direcao=saida    o que o PMB ENVIOU (webhook_deliveries, todos os endpoints)
 *   direcao=entrada  o que o PMB RECEBEU (webhook_logs: LMS, Asaas, Mercado Pago)
 *
 * Status de ENTRADA sai de `processed`, não de `error`: o processador do Asaas
 * grava observação em `error` também no que deu certo ("matrícula não
 * encontrada" processada), então `error` preenchido não é falha.
 *
 * Paginação por `antes` (createdAt da última linha): 50 por página.
 */

const PAGE = 50

const querySchema = z.object({
  direcao: z.enum(["saida", "entrada"]).default("saida"),
  status: z.enum(["todos", "ok", "erro", "fila"]).default("todos"),
  origem: z.enum(["LMS", "ASAAS", "MERCADO_PAGO"]).optional(),
  antes: z.string().datetime().optional(),
})

export const GET = withRequestContext(
  { action: "admin.webhooks.log", route: "/api/admin/webhooks/log" },
  async (request: Request) => {
    const guard = await requireAdmin("integracoes.view")
    if (!guard.ok) return guard.response

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: "Filtro inválido" }, { status: 400 })
    }
    const { direcao, status, origem, antes } = parsed.data
    const createdAt = antes ? { lt: new Date(antes) } : undefined

    if (direcao === "saida") {
      const where: Prisma.WebhookDeliveryWhereInput = {
        ...(createdAt ? { createdAt } : {}),
        ...(status === "ok" ? { status: "DELIVERED" } : {}),
        // "erro" inclui a entrega que ainda vai ser tentada de novo: falhou, só
        // não desistimos dela ainda.
        ...(status === "erro"
          ? { OR: [{ status: "FAILED" }, { status: "PENDING", lastError: { not: null } }] }
          : {}),
        ...(status === "fila" ? { status: "PENDING" } : {}),
      }
      const rows = await prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE,
        select: {
          id: true,
          event: true,
          status: true,
          attempts: true,
          nextAttemptAt: true,
          lastStatusCode: true,
          lastError: true,
          deliveredAt: true,
          createdAt: true,
          payload: true,
          endpoint: { select: { name: true, url: true } },
        },
      })
      return NextResponse.json({
        data: {
          itens: rows.map((r) => ({
            id: r.id,
            quando: r.createdAt,
            evento: r.event,
            situacao: r.status === "DELIVERED" ? "ok" : r.status === "FAILED" ? "erro" : r.lastError ? "erro" : "fila",
            destino: `${r.endpoint.name} — ${r.endpoint.url}`,
            detalhe: [
              r.lastStatusCode ? `HTTP ${r.lastStatusCode}` : null,
              r.lastError,
              `${r.attempts} tentativa(s)`,
              r.status === "PENDING" && r.attempts > 0
                ? `próxima ${r.nextAttemptAt.toISOString()}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
            payload: r.payload,
          })),
          proximo: rows.length === PAGE ? rows.at(-1)!.createdAt : null,
        },
      })
    }

    const where: Prisma.WebhookLogWhereInput = {
      ...(createdAt ? { createdAt } : {}),
      ...(origem ? { source: origem } : {}),
      ...(status === "ok" ? { processed: true } : {}),
      ...(status === "erro" || status === "fila" ? { processed: false } : {}),
    }
    const rows = await prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE,
      select: {
        id: true,
        source: true,
        eventType: true,
        processed: true,
        error: true,
        createdAt: true,
        payload: true,
        tenant: { select: { name: true } },
      },
    })
    return NextResponse.json({
      data: {
        itens: rows.map((r) => ({
          id: r.id,
          quando: r.createdAt,
          evento: r.eventType,
          situacao: r.processed ? "ok" : "erro",
          destino: [r.source, r.tenant?.name].filter(Boolean).join(" — "),
          detalhe: r.error ?? "",
          payload: r.payload,
        })),
        proximo: rows.length === PAGE ? rows.at(-1)!.createdAt : null,
      },
    })
  },
)
