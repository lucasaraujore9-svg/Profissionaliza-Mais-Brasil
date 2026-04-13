import type { Metadata } from "next"
import { NavbarLoja } from "@/components/shared/layouts/navbar-loja"
import { FooterLoja } from "@/components/shared/layouts/footer-loja"

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
      <NavbarLoja />
      <main className="flex-1">{children}</main>
      <FooterLoja />
    </>
  )
}
