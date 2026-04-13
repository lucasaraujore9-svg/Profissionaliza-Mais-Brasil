import type { Metadata } from "next"
import { PainelLayoutShell } from "./layout-shell"

export const metadata: Metadata = {
  title: "Painel do Revendedor | Profissionaliza Mais Brasil",
  description: "Gerencie sua vitrine, alunos e vendas",
}

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PainelLayoutShell>{children}</PainelLayoutShell>
}
