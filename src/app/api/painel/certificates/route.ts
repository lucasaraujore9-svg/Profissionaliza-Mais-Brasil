import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import type { Prisma } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.certificates.list", route: "/api/painel/certificates" },
  async (request: Request) => {
    const guard = await requirePainel("certificados.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const url = new URL(request.url)
    const q = url.searchParams.get("q")?.trim() ?? ""
    const status = url.searchParams.get("status") ?? "all" // all | issued | revoked
    const from = url.searchParams.get("from")
    const to = url.searchParams.get("to")

    const where: Prisma.CertificateWhereInput = {
      tenantId: ctx.tenantId,
    }

    if (status === "issued") {
      where.revokedAt = null
    } else if (status === "revoked") {
      where.revokedAt = { not: null }
    }

    if (q) {
      where.OR = [
        { studentName: { contains: q, mode: "insensitive" } },
        { courseName: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ]
    }

    if (from || to) {
      const range: { gte?: Date; lte?: Date } = {}
      if (from) range.gte = new Date(from)
      if (to) range.lte = new Date(to)
      where.createdAt = range
    }

    const certificates = await prisma.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        code: true,
        studentName: true,
        courseName: true,
        completionDate: true,
        pdfUrl: true, // só para derivar hasPdf — NÃO é exposto ao client (URL pública/PII)
        revokedAt: true,
        revokedReason: true,
        source: true,
        createdAt: true,
        enrollmentId: true,
      },
    })

    return NextResponse.json({
      data: certificates.map((c) => ({
        id: c.id,
        code: c.code,
        studentName: c.studentName,
        courseName: c.courseName,
        completionDate: c.completionDate.toISOString(),
        hasPdf: Boolean(c.pdfUrl),
        revokedAt: c.revokedAt?.toISOString() ?? null,
        revokedReason: c.revokedReason,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
        enrollmentId: c.enrollmentId,
      })),
    })
  },
)
