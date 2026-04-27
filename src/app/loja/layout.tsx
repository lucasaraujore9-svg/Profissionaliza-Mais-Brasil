import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"

export const metadata: Metadata = {
  title: "Cursos Online",
  description: "Encontre os melhores cursos profissionalizantes online",
}

export default function LojaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <NavbarMain />
      <main className="flex-1">{children}</main>
      <FooterMain />
    </>
  )
}
