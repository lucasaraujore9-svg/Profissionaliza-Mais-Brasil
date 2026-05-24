import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isInternalAuthorized } from "@/lib/auth/bearer"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"

// Validações server-side de slug e custom domain.
// Slug: mesmo regex do Tenant.slug — letras minúsculas, números, hífen e underscore.
// Domain: hostname FQDN básico (até 253 chars, labels alfanuméricos).
const SLUG_RE = /^[a-z0-9_-]{1,64}$/
const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

export async function GET(request: Request) {
  // Rate-limit defense-in-depth: mesmo que o secret seja conhecido, bot
  // não consegue varrer slugs/domains do banco em massa.
  const rl = await rateLimit(request, {
    name: "internal-resolve",
    limit: 60,
    windowSec: 60,
  })
  if (!rl.ok) return rateLimitResponse(rl)

  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")?.toLowerCase().trim() || null
  const domain = searchParams.get("domain")?.toLowerCase().trim() || null

  if (!slug && !domain) {
    return NextResponse.json({ error: "missing param" }, { status: 400 })
  }
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 })
  }
  if (domain && !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "invalid domain" }, { status: 400 })
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
