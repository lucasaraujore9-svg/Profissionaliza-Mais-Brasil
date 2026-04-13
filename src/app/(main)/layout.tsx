import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"

export const metadata: Metadata = {
  title: "Profissionaliza Mais Brasil — Cursos Profissionalizantes Online",
  description:
    "Plataforma de revenda de cursos profissionalizantes online. Tenha sua própria vitrine e comece a vender.",
}

export default function MainLayout({
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
