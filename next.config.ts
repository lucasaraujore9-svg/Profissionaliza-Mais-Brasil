import type { NextConfig } from "next";

// Headers de seguranca aplicados a todas as rotas (HTML, API, assets).
// Mantemos uma CSP relativamente aberta porque o app embute SDK do
// Mercado Pago, logos hospedados no Supabase Storage e ainda usa inline
// styles do Tailwind/shadcn — uma policy mais estrita exigiria nonces.
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
      "img-src 'self' data: blob: https://*.supabase.co https://playcurso.com",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://va.vercel-scripts.com",
      "connect-src 'self' https://api.mercadopago.com https://*.supabase.co https://*.upstash.io https://api.resend.com https://vitals.vercel-insights.com",
      // 'self' blob: permite o preview do PDF do certificado, embutido via
      // <iframe src="blob:..."> no editor de template (admin/painel). Sem isto
      // o navegador bloqueia o embed ("conteúdo bloqueado"). frame-ancestors
      // 'none' + X-Frame-Options: DENY continuam protegendo contra clickjacking.
      "frame-src 'self' blob: https://www.mercadopago.com https://sdk.mercadopago.com",
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
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "playcurso.com" },
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
