import type { Metadata } from "next"
import { BrandPanel } from "@/components/auth/brand-panel"

export const metadata: Metadata = {
  title: "Login | Profissionaliza Mais Brasil",
  description: "Acesse sua conta no Profissionaliza Mais Brasil",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[var(--color-pmb-mist)]">
      <BrandPanel />

      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
