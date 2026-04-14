import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const secret = request.headers.get("x-internal-secret")
  const expected = process.env.INTERNAL_SECRET

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")
  const domain = searchParams.get("domain")

  if (!slug && !domain) {
    return NextResponse.json({ error: "missing param" }, { status: 400 })
  }

  try {
    const tenant = await prisma.tenant.findFirst({
      where: slug
        ? { slug }
        : { customDomain: domain ?? undefined, domainVerified: true },
      select: { id: true, slug: true, status: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (error) {
    console.error("[resolve-tenant] error:", error)
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
