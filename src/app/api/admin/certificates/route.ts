import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import type { Prisma } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.certificates.list", route: "/api/admin/certificates" },
  async (request: Request) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const status = url.searchParams.get("status") ?? "all"
  const tenantFilter = url.searchParams.get("tenantId") // "pmb" -> null, "any" -> sem filtro, id -> filtra
  const courseId = url.searchParams.get("courseId")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const where: Prisma.CertificateWhereInput = {}

  if (tenantFilter === "pmb") {
    where.tenantId = null
  } else if (tenantFilter && tenantFilter !== "any" && tenantFilter !== "all") {
    where.tenantId = tenantFilter
  }

  // PMB_RESELLER_MGR só vê certificados dos tenants atribuídos a ele (ou PMB se permitido).
  // PMB_SALES é equiparado: só certificados PMB.
  if (ctx.role === "PMB_RESELLER_MGR") {
    if (tenantFilter && tenantFilter !== "pmb" && tenantFilter !== "any" && tenantFilter !== "all") {
      const t = await prisma.tenant.findUnique({
        where: { id: tenantFilter },
        select: { accountManagerId: true },
      })
      if (t?.accountManagerId !== ctx.userId) {
        return NextResponse.json({ error: "Sem permissao para este tenant" }, { status: 403 })
      }
    } else {
      // Sem tenant explícito ou "any"/"all" — restringe aos tenants do mgr.
      where.tenant = { accountManagerId: ctx.userId }
    }
  } else if (ctx.role === "PMB_SALES") {
    where.tenantId = null
  }

  if (courseId) where.courseId = courseId

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
      tenantId: true,
      tenant: { select: { id: true, name: true, slug: true } },
      enrollmentId: true,
      courseId: true,
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
      tenantId: c.tenantId,
      tenantName: c.tenant?.name ?? "PMB (Vitrine principal)",
      tenantSlug: c.tenant?.slug ?? null,
      enrollmentId: c.enrollmentId,
      courseId: c.courseId,
    })),
  })
  },
)
