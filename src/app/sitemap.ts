import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"

const BASE_URL =
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${BASE_URL}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }))

  let courseEntries: MetadataRoute.Sitemap = []
  try {
    const courses = await prisma.course.findMany({
      where: { status: "ATIVO", hiddenMain: false },
      select: { slug: true, updatedAt: true },
      take: 5000,
    })
    courseEntries = courses
      .filter((c) => Boolean(c.slug))
      .map((c) => ({
        url: `${BASE_URL}/cursos/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
  } catch {
    // Banco indisponivel no build: serve sitemap so com paginas estaticas.
  }

  return [...staticEntries, ...courseEntries]
}
