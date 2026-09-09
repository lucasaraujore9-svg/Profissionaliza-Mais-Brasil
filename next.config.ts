import type { NextConfig } from "next";
import { trackingOrigins } from "./src/lib/tracking/csp";

// Headers de seguranca aplicados a todas as rotas (HTML, API, assets).
// Mantemos uma CSP relativamente aberta porque o app embute SDK do
// Mercado Pago, logos hospedados no Supabase Storage e ainda usa inline
// styles do Tailwind/shadcn — uma policy mais estrita exigiria nonces.

// Acrescenta a uma diretiva as origens dos pixels de rastreamento (Meta, Google,
// TikTok, LinkedIn, Pinterest, Bing, Clarity, Hotjar). A lista mora em
// src/lib/tracking/csp.ts, ao lado dos snippets que carregam esses scripts —
// pixel bloqueado pela CSP falha em SILENCIO (o painel segue dizendo
// "instalado" e nenhum evento chega ao gerenciador de anuncios), entao manter a
// permissao longe do codigo que a exige foi o que deixou a Meta morta nas
// vitrines das revendas por meses.
const px = (base: string, directive: "script" | "connect" | "img" | "frame" | "font") =>
  [base, ...trackingOrigins(directive)].join(" ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // interest-cohort=() foi removido — FLoC foi descontinuado em 2024
    // (substituido pela Topics API). Browsers modernos geram warning
    // "Unrecognized feature: 'interest-cohort'" quando veem isso.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      // img.youtube.com / i.ytimg.com: thumbnails (capa) dos modulos de
      // Treinamento, que usam o frame do YouTube. Sem isto a CSP bloqueia a capa.
      px("img-src 'self' data: blob: https://*.supabase.co https://playcurso.com https://s3.bmbr.com.br https://img.youtube.com https://i.ytimg.com", "img"),
      px("font-src 'self' data:", "font"),
      "style-src 'self' 'unsafe-inline'",
      px("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://va.vercel-scripts.com", "script"),
      px("connect-src 'self' https://api.mercadopago.com https://*.supabase.co https://*.upstash.io https://api.resend.com https://vitals.vercel-insights.com", "connect"),
      // 'self' blob: permite o preview do PDF do certificado, embutido via
      // <iframe src="blob:..."> no editor de template (admin/painel). Sem isto
      // o navegador bloqueia o embed ("conteúdo bloqueado"). frame-ancestors
      // 'none' + X-Frame-Options: DENY continuam protegendo contra clickjacking.
      // youtube-nocookie.com / youtube.com: player embutido (iframe) dos videos
      // de Treinamento (youtubeEmbedUrl usa youtube-nocookie). Sem isto o video
      // nao carrega ("conteudo bloqueado").
      px("frame-src 'self' blob: https://www.mercadopago.com https://sdk.mercadopago.com https://www.youtube-nocookie.com https://www.youtube.com", "frame"),
      "form-action 'self' https://www.mercadopago.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Pacotes pesados/CJS usados apenas no servidor (geracao de PDF do
  // certificado). Mante-los externos evita que o bundler do Next tente
  // empacota-los em paginas/rotas server.
  serverExternalPackages: ["@react-pdf/renderer", "qrcode"],
  images: {
    // Otimizador de imagem da Vercel segue DESLIGADO (cota 402 esgotada), mas
    // servir os originais direto (unoptimized global) derrubava Android de
    // entrada: dezenas de imagens em resolucao cheia estouram a memoria da GPU
    // e o compositor pinta faixas de ruido na vitrine (mesma familia dos
    // "fantasmas" mobile). O loader customizado abaixo roteia as imagens
    // remotas pelo nosso proxy /api/img (sharp + WebP + cache no CDN), que nao
    // depende da cota paga. Fora da allowlist do loader, a imagem passa direto
    // (equivalente a unoptimized).
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Com loader customizado o Next nao consulta remotePatterns; a lista fica
    // como documentacao dos hosts aceitos (a allowlist real esta em
    // src/lib/images.ts, compartilhada entre loader e proxy).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "playcurso.com" },
      { protocol: "https", hostname: "s3.bmbr.com.br" },
      // Thumbnails dos modulos de Treinamento (capa via frame do YouTube).
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    return [
      {
        // Headers de seguranca aplicados a tudo
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // O service worker precisa revalidar sempre — caso contrario
        // navegadores podem segurar versoes antigas por horas.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        // Icones podem cachear longo
        source: "/icons/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
