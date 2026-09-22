import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { APP_ICON_SIZE } from "@/lib/pwa/app-icon"

// MANIFEST ÚNICO do app, para TODA rota e TODO domínio — o root layout aponta
// para cá e nenhum segmento sobrescreve.
//
// Era por segmento, e por isso vazava: só /loja, /aluno e (main) trocavam o
// manifest pelo da unidade; /login (onde o aluno de fato instala o app), /painel
// e o resto herdavam o /manifest.webmanifest estático e o atalho nascia com o
// nome e a logo da PMB na tela do aluno de uma revenda.
//
// O proxy seta x-tenant-slug para qualquer host de tenant (inclusive em rotas
// /api/*), então resolvemos a unidade por slug. Sem header = domínio da PMB.
export const dynamic = "force-dynamic"

const PMB_THEME_COLOR = "#055918"

const PMB_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
  { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
]

// O Chrome descarta ícone sem `type` cuja extensão ele não reconhece (uma logo
// .jpg some da instalação). Como o asset vem do Storage com a extensão que foi
// enviada, deduzimos daí — e desistimos do ícone quando não dá para afirmar.
function mimeFromUrl(url: string): string | null {
  const path = url.split("?")[0].toLowerCase()
  if (path.endsWith(".png")) return "image/png"
  if (path.endsWith(".webp")) return "image/webp"
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg"
  return null
}

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
  purpose: string
}

function tenantIcons(tenant: {
  appIconUrl: string | null
  faviconUrl: string | null
  logoUrl: string | null
}): ManifestIcon[] {
  // Ícone dedicado do app: quadrado, com fundo, gerado no upload — pode entrar
  // como `maskable` (o Android recorta as bordas sem comer o desenho).
  if (tenant.appIconUrl) {
    return [
      {
        src: tenant.appIconUrl,
        sizes: `${APP_ICON_SIZE}x${APP_ICON_SIZE}`,
        type: "image/png",
        purpose: "any maskable",
      },
    ]
  }

  // Sem ele, favicon ou logo crua: dimensão desconhecida e possivelmente
  // transparente, então NUNCA `maskable` — seria recortada.
  const fallback = tenant.faviconUrl ?? tenant.logoUrl
  if (!fallback) return []
  const type = mimeFromUrl(fallback)
  return [{ src: fallback, sizes: "any", purpose: "any", ...(type ? { type } : {}) }]
}

export async function GET() {
  const h = await headers()
  const slug = h.get("x-tenant-slug")
  const tenantId = h.get("x-tenant-id")

  let tenant: {
    name: string
    primaryColor: string | null
    logoUrl: string | null
    faviconUrl: string | null
    appIconUrl: string | null
  } | null = null

  if (tenantId || slug) {
    try {
      tenant = await prisma.tenant.findFirst({
        where: tenantId ? { id: tenantId } : { slug: slug ?? undefined },
        select: {
          name: true,
          primaryColor: true,
          logoUrl: true,
          faviconUrl: true,
          appIconUrl: true,
        },
      })
    } catch {
      tenant = null
    }
  }

  // Host de revenda cujo tenant nao resolveu (removido, ou banco fora do ar):
  // manifest neutro, NUNCA o da PMB. Cair na marca da plataforma aqui poria a
  // logo dela na tela inicial de quem instalou pelo dominio da unidade — o
  // mesmo vazamento que esta rota existe para fechar.
  const isTenantHost = Boolean(tenantId || slug)
  const name = tenant?.name ?? (isTenantHost ? "Cursos Online" : "Profissionaliza Mais Brasil")
  const shortName =
    isTenantHost || tenant ? (name.length > 12 ? name.slice(0, 12) : name) : "PMB"

  const manifest = {
    name,
    short_name: shortName,
    description: isTenantHost
      ? `Cursos profissionalizantes online — ${name}.`
      : "Plataforma de cursos profissionalizantes — gestão, vendas e área do aluno.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: tenant?.primaryColor ?? (isTenantHost ? "#6b7280" : PMB_THEME_COLOR),
    lang: "pt-BR",
    dir: "ltr",
    categories: isTenantHost
      ? ["education"]
      : ["education", "business", "productivity"],
    prefer_related_applications: false,
    // Ícone da unidade — nunca o da PMB: instalar a vitrine de uma revenda não
    // pode colocar a marca da plataforma na tela inicial do aluno dela.
    icons: isTenantHost ? (tenant ? tenantIcons(tenant) : []) : PMB_ICONS,
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Cache curto: branding da unidade pode mudar; não fixar por muito tempo.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
