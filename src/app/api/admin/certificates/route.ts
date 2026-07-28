import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.certificates.list", route: "/api/admin/certificates" },
  async (request: Request) => {
  const guard = await requireAdmin("certificados.view")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

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

  // Recorte de quem não enxerga a rede inteira. Quem administra unidades vê os
  // certificados da própria carteira; quem só opera a vitrine PMB (vendedor de
  // curso) vê apenas os certificados da PMB.
  if (!ctx.can("unidades.viewAll") && ctx.can("unidades.view")) {
    if (tenantFilter && tenantFilter !== "pmb" && tenantFilter !== "any" && tenantFilter !== "all") {
      const t = await prisma.tenant.findUnique({
        where: { id: tenantFilter },
        select: { accountManagerId: true, salesUserId: true },
      })
      if (!(await ctx.canAccessTenant(t))) {
        return NextResponse.json({ error: "Sem permissao para este tenant" }, { status: 403 })
      }
    } else {
      // Sem tenant explícito ou "any"/"all" — restringe à carteira, no formato
      // do papel (`unidadesWhere` cobre accountManagerId, salesUserId e time).
      const scope = await ctx.unidadesWhere()
      if (!scope) {
        return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
      }
      where.tenant = scope
    }
  } else if (!ctx.can("unidades.viewAll")) {
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
      pdfUrl: true, // só para derivar hasPdf — NÃO é exposto ao client (URL pública/PII)
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
      hasPdf: Boolean(c.pdfUrl),
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
