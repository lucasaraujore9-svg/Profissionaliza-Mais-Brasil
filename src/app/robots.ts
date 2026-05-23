import type { MetadataRoute } from "next"

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://profissionalizamaisbrasil.com.br"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/cursos", "/categoria", "/sobre", "/ajuda", "/contato"],
        disallow: [
          "/admin",
          "/painel",
          "/aluno",
          "/api",
          "/cobranca",
          "/inadimplente",
          "/loja/suspended",
          "/loja/checkout",
          "/loja/confirmacao",
          "/alterar-senha-inicial",
          "/login",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
