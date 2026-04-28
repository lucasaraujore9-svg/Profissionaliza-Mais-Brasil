import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"

export const metadata: Metadata = {
  title: "Profissionaliza Mais Brasil — Cursos Profissionalizantes Online",
  description:
    "Plataforma de revenda de cursos profissionalizantes online. Tenha sua própria vitrine e comece a vender.",
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const categorias = await loadCategorias()
  return (
    <>
      <NavbarMain categorias={categorias} />
      <main className="flex-1">{children}</main>
      <FooterMain />
    </>
  )
}
