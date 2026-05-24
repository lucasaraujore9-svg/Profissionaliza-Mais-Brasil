import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { Toaster } from "sonner";
import { assertEnv } from "@/lib/env";

// Fail-fast em produção se faltar env essencial (AUTH_SECRET, MP_WEBHOOK_SECRET,
// CRON_SECRET, etc.). Em dev só emite warnings. Roda 1x no boot do servidor.
assertEnv();

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://www.profissionalizamaisbrasil.com.br";

const DEFAULT_DESCRIPTION =
  "Cursos profissionalizantes online com certificado reconhecido nacionalmente. Estude pelo celular, pague no Pix e ganhe uma profissão no seu ritmo."

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Profissionaliza Mais Brasil",
    template: "%s · Profissionaliza Mais Brasil",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Profissionaliza Mais Brasil",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PMB",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Profissionaliza Mais Brasil",
    locale: "pt_BR",
    url: APP_URL,
    title: "Profissionaliza Mais Brasil",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Profissionaliza Mais Brasil",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Profissionaliza Mais Brasil",
    description: DEFAULT_DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#055918",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <CookieConsent />
        <ServiceWorkerRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
