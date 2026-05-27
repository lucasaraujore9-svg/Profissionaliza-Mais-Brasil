import type { Metadata } from "next"
import { NavbarMain } from "@/components/shared/layouts/navbar-main"
import { FooterMain } from "@/components/shared/layouts/footer-main"
import { loadCategorias } from "@/lib/catalog/home"
import { loadPmbTecnicaConfig } from "@/lib/catalog/tecnica"

export const metadata: Metadata = {
  title: "Profissionaliza Mais Brasil — Cursos profissionalizantes online",
  description:
    "Cursos profissionalizantes online com certificado reconhecido nacionalmente. Estude pelo celular, pague no Pix e ganhe uma profissão no seu ritmo.",
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [categorias, tecnica] = await Promise.all([
    loadCategorias(),
    loadPmbTecnicaConfig(),
  ])
  return (
    <>
      <NavbarMain
        categorias={categorias}
        tecnica={{ enabled: tecnica.enabled, label: tecnica.label, url: tecnica.url }}
      />
      <main className="flex-1">{children}</main>
      <FooterMain categorias={categorias} />
    </>
  )
}
