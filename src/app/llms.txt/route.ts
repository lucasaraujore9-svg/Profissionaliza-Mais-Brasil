// /llms.txt — guia em Markdown para motores generativos (GEO).
// Resume o que é a plataforma e aponta os recursos canônicos, ajudando
// ChatGPT, Gemini, Perplexity, Claude etc. a responder com fatos corretos.
//
// Host-aware: no site mãe descreve a PMB; numa vitrine descreve a revenda.

import { prisma } from "@/lib/prisma"
import { classifyRequestHost, getRequestOrigin } from "@/lib/seo/host"
import { vitrineDomain } from "@/lib/tenant/urls"
import {
  SITE_NAME,
  SITE_DESCRIPTION,
  siteUrl,
  SOCIAL_PROFILES,
} from "@/lib/seo/site"

export const revalidate = 3600

function stripPort(host: string): string {
  return host.split(":")[0]
}

function textResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}

function appLlms(): string {
  const url = siteUrl()
  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} é uma plataforma brasileira de cursos profissionalizantes online com certificado reconhecido nacionalmente. Os alunos estudam pelo celular ou computador, pagam via Pix, cartão ou boleto, e recebem certificado ao concluir. O atendimento e os cursos são em português (pt-BR) e a área de atuação é todo o Brasil.

## Principais páginas
- [Catálogo de cursos](${url}/cursos): lista completa de cursos profissionalizantes.
- [Como funciona](${url}/como-funciona): passo a passo da matrícula até o certificado.
- [Sobre](${url}/sobre): quem somos.
- [Central de ajuda](${url}/ajuda): dúvidas frequentes.
- [Contato](${url}/contato): fale com a equipe.
- [Seja revendedor](${url}/seja-revendedor): monte sua própria vitrine de cursos.

## Recursos
- Sitemap: ${url}/sitemap.xml
- Idioma: português (pt-BR)
- País: Brasil

## Redes
${SOCIAL_PROFILES.map((p) => `- ${p}`).join("\n")}
`
}

function vitrineLlms(opts: {
  origin: string
  name: string
  description: string | null
  courses: Array<{ slug: string; nome: string }>
}): string {
  const base = opts.origin.replace(/\/$/, "")
  const desc =
    opts.description ??
    `${opts.name} é uma vitrine de cursos profissionalizantes online com certificado, em parceria com a ${SITE_NAME}.`
  const courseList =
    opts.courses.length > 0
      ? opts.courses
          .map((c) => `- [${c.nome}](${base}/curso/${c.slug})`)
          .join("\n")
      : "- (catálogo em atualização)"
  return `# ${opts.name}

> ${desc}

${opts.name} é uma vitrine de cursos profissionalizantes online (EAD) com certificado, atendendo todo o Brasil em português (pt-BR). As matrículas e pagamentos são feitos diretamente nesta vitrine.

## Cursos em destaque
${courseList}

## Recursos
- Sitemap: ${base}/sitemap.xml
- Idioma: português (pt-BR)
- País: Brasil
`
}

export async function GET(): Promise<Response> {
  const host = await classifyRequestHost()

  if (host.kind === "vitrine_apex") {
    const base = `https://${vitrineDomain()}`
    return textResponse(`# Livre Cursos

> Monte sua revenda de cursos profissionalizantes online com vitrine pronta, domínio próprio e checkout integrado.

Livre Cursos é a plataforma white-label da ${SITE_NAME} para criar vitrines de revenda de cursos profissionalizantes no Brasil.

## Recursos
- Sitemap: ${base}/sitemap.xml
- Idioma: português (pt-BR)
- País: Brasil
`)
  }

  if (host.kind === "tenant" || host.kind === "unknown") {
    const origin = await getRequestOrigin()
    if (origin) {
      try {
        const bareHost = stripPort(new URL(origin).host)
        const tenant = await prisma.tenant.findFirst({
          where: host.slug ? { slug: host.slug } : { customDomain: bareHost },
          select: { id: true, name: true, description: true, tagline: true },
        })
        if (tenant) {
          const tcs = await prisma.tenantCourse.findMany({
            where: {
              tenantId: tenant.id,
              isVisible: true,
              course: { status: "ATIVO" },
            },
            orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
            take: 20,
            select: { course: { select: { slug: true, nome: true } } },
          })
          const courses = tcs
            .map((t) => t.course)
            .filter((c): c is { slug: string; nome: string } => Boolean(c?.slug))
          return textResponse(
            vitrineLlms({
              origin,
              name: tenant.name,
              description: tenant.description ?? tenant.tagline,
              courses,
            }),
          )
        }
      } catch {
        // cai no llms.txt do site mãe
      }
    }
  }

  return textResponse(appLlms())
}
