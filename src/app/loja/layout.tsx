import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"

export const metadata: Metadata = {
  title: "Cursos Online",
  description: "Encontre os melhores cursos profissionalizantes online",
}

export default async function LojaLayout({
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
