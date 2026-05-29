import type { MetadataRoute } from "next"
import { classifyRequestHost, getRequestOrigin } from "@/lib/seo/host"

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://profissionalizamaisbrasil.com.br"

// Crawlers de IA / motores generativos (GEO). Liberados explicitamente para
// que a plataforma e os cursos apareçam em respostas de ChatGPT, Gemini,
// Perplexity, Claude, etc.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-Web",
  "Anthropic-AI",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "Meta-ExternalAgent",
]

// Diretórios sempre privados (válido para PMB e vitrines).
const PRIVATE_PATHS = [
  "/admin",
  "/painel",
  "/aluno",
  "/api",
  "/cobranca",
  "/inadimplente",
  "/checkout",
  "/confirmacao",
  "/loja/suspended",
  "/loja/checkout",
  "/loja/confirmacao",
  "/alterar-senha-inicial",
  "/login",
  "/forgot-password",
  "/reset-password",
]

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = await classifyRequestHost()
  const isVitrine = host.kind === "tenant" || host.kind === "unknown"

  // Em vitrines, o sitemap correto é o do próprio domínio do revendedor.
  const origin = await getRequestOrigin()
  const sitemapBase = isVitrine && origin ? origin : APP_BASE_URL

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Welcome explícito aos crawlers de IA (mesmas regras de privacidade).
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${sitemapBase.replace(/\/$/, "")}/sitemap.xml`,
  }
}
