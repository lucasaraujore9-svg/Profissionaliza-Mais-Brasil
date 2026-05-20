import type { Metadata } from "next"
import { LivrecursosHeader } from "@/components/livrecursos/header"
import { LivrecursosFooter } from "@/components/livrecursos/footer"

export const metadata: Metadata = {
  title: {
    default: "Livre Cursos · Vitrines para quem ensina",
    template: "%s · Livre Cursos",
  },
  description:
    "Monte sua revenda de cursos profissionalizantes online com vitrine pronta, domínio próprio e checkout integrado.",
}

export default function LivrecursosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LivrecursosHeader />
      <main className="flex-1">{children}</main>
      <LivrecursosFooter />
    </div>
  )
}
