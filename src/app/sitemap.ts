import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { classifyRequestHost, getRequestOrigin } from "@/lib/seo/host"
import { vitrineDomain } from "@/lib/tenant/urls"
import { COURSE_HAS_PRICE } from "@/lib/catalog/visibility"

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://profissionalizamaisbrasil.com.br"

export const revalidate = 3600

const STATIC_PATHS: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/cursos", changeFrequency: "weekly", priority: 0.9 },
  { path: "/sobre", changeFrequency: "monthly", priority: 0.6 },
  { path: "/como-funciona", changeFrequency: "monthly", priority: 0.5 },
  { path: "/ajuda", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contato", changeFrequency: "yearly", priority: 0.4 },
  { path: "/reembolso", changeFrequency: "yearly", priority: 0.3 },
  { path: "/termos", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacidade", changeFrequency: "yearly", priority: 0.2 },
  { path: "/seja-revendedor", changeFrequency: "monthly", priority: 0.8 },
]

function stripPort(host: string): string {
  return host.split(":")[0]
}

// Sitemap de uma vitrine (revenda): home + cursos visíveis na própria origem.
async function vitrineSitemap(
  origin: string,
  tenantId: string,
): Promise<MetadataRoute.Sitemap> {
  const base = origin.replace(/\/$/, "")
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
  ]
  try {
    const courses = await prisma.tenantCourse.findMany({
      where: { tenantId, isVisible: true, price: { gt: 0 }, course: { status: "ATIVO" } },
      select: { updatedAt: true, course: { select: { slug: true } } },
      take: 5000,
    })
    for (const tc of courses) {
      if (!tc.course?.slug) continue
      entries.push({
        url: `${base}/curso/${tc.course.slug}`,
        lastModified: tc.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      })
    }
  } catch {
    // Banco indisponível: serve só a home da vitrine.
  }
  return entries
}

// Sitemap do site mãe (PMB): páginas institucionais + catálogo principal.
async function appSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${APP_BASE_URL}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }))

  let courseEntries: MetadataRoute.Sitemap = []
  try {
    const courses = await prisma.course.findMany({
      where: { status: "ATIVO", hiddenMain: false, AND: [COURSE_HAS_PRICE] },
      select: { slug: true, updatedAt: true },
      take: 5000,
    })
    courseEntries = courses
      .filter((c) => Boolean(c.slug))
      .map((c) => ({
        url: `${APP_BASE_URL}/cursos/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
  } catch {
    // Banco indisponível no build: serve sitemap só com páginas estáticas.
  }

  return [...staticEntries, ...courseEntries]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = await classifyRequestHost()

  // Landing de captação (livrecursos.com.br): sitemap mínimo.
  if (host.kind === "vitrine_apex") {
    const base = `https://${vitrineDomain()}`
    return [
      { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    ]
  }

  // Vitrine de revenda: resolve o tenant e serve o sitemap da própria origem.
  if (host.kind === "tenant" || host.kind === "unknown") {
    const origin = await getRequestOrigin()
    if (origin) {
      try {
        const bareHost = stripPort(new URL(origin).host)
        const tenant = await prisma.tenant.findFirst({
          where: host.slug
            ? { slug: host.slug }
            : { customDomain: bareHost },
          select: { id: true },
        })
        if (tenant) return vitrineSitemap(origin, tenant.id)
      } catch {
        // cai no sitemap do site mãe
      }
    }
  }

  return appSitemap()
}
