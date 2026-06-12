import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

// Manifest PWA por revenda. O root layout aponta `manifest` para o estático
// public/manifest.webmanifest (PMB); no contexto de uma vitrine, o
// tenantVitrineMetadata sobrescreve para esta rota, que devolve nome, cor de
// tema e ícone da própria unidade — para que instalar a vitrine como app não
// exponha a marca PMB.
//
// O proxy seta x-tenant-slug para qualquer host de tenant (inclusive em rotas
// /api/*), então resolvemos a unidade por slug.
export const dynamic = "force-dynamic"

const DEFAULT_THEME_COLOR = "#055918"

export async function GET() {
  const h = await headers()
  const slug = h.get("x-tenant-slug")
  const tenantId = h.get("x-tenant-id")

  let tenant: { name: string; primaryColor: string | null; logoUrl: string | null } | null =
    null

  if (tenantId || slug) {
    try {
      tenant = await prisma.tenant.findFirst({
        where: tenantId ? { id: tenantId } : { slug: slug ?? undefined },
        select: { name: true, primaryColor: true, logoUrl: true },
      })
    } catch {
      tenant = null
    }
  }

  const name = tenant?.name ?? "Cursos Online"
  const themeColor = tenant?.primaryColor ?? DEFAULT_THEME_COLOR

  // Ícone do app = logo da unidade (sem logo, sem ícone — nunca a logo da PMB).
  const icons = tenant?.logoUrl
    ? [{ src: tenant.logoUrl, sizes: "any", purpose: "any" as const }]
    : []

  const manifest = {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: `Cursos profissionalizantes online — ${name}.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: themeColor,
    lang: "pt-BR",
    dir: "ltr",
    categories: ["education"],
    prefer_related_applications: false,
    icons,
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Cache curto: branding da unidade pode mudar; não fixar por muito tempo.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
