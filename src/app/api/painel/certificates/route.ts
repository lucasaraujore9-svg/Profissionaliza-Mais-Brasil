import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import type { Prisma } from "@prisma/client"

export async function GET(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

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
      pdfUrl: true,
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
      pdfUrl: c.pdfUrl,
      revokedAt: c.revokedAt?.toISOString() ?? null,
      revokedReason: c.revokedReason,
      source: c.source,
      createdAt: c.createdAt.toISOString(),
      enrollmentId: c.enrollmentId,
    })),
  })
}
