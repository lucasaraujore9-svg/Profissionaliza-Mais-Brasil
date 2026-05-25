import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Caracteres que iniciam fórmula em Excel/Sheets (CSV injection).
const CSV_FORMULA_TRIGGERS = /^[=+\-@\t\r]/

function escapeCsv(value: string | number | null): string {
  if (value === null || value === undefined) return ""
  let str = String(value)
  // Defesa contra formula injection: prefixa com aspa simples.
  if (CSV_FORMULA_TRIGGERS.test(str)) str = `'${str}`
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export const GET = withRequestContext(
  { action: "painel.financeiro.export_csv", route: "/api/painel/financeiro/export-csv" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const status = searchParams.get("status")

    const dateFrom = from ? new Date(from) : undefined
    const dateTo = to ? new Date(to + "T23:59:59") : undefined

    const payments = await prisma.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        ...(status
          ? { mpStatus: status as "APPROVED" | "PENDING" | "REJECTED" | "REFUNDED" | "CANCELLED" | "IN_PROCESS" | "CHARGED_BACK" }
          : {}),
      },
      include: {
        enrollment: {
          include: {
            student: { select: { nome: true, email: true } },
            course: { select: { nome: true } },
          },
        },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    })

    const header = [
      "data",
      "aluno",
      "email",
      "curso",
      "valor",
      "status",
      "tipo",
      "mp_payment_id",
    ]
    const rows = payments.map((p) => [
      (p.paidAt ?? p.createdAt).toISOString(),
      p.enrollment.student.nome,
      p.enrollment.student.email,
      p.enrollment.course.nome,
      Number(p.amount).toFixed(2),
      p.mpStatus,
      p.type,
      p.mpPaymentId,
    ])

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n")

    const filename = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`
    const safeAscii = filename.replace(/[\r\n"\\;]/g, "_")
    const encoded = encodeURIComponent(filename)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    })
  },
)
