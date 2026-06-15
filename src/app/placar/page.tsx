import type { Metadata } from "next"
import { getPlacarSnapshot } from "@/lib/placar/snapshot"
import { PlacarClient } from "@/components/placar/placar-client"

// Placar publico de lancamento — sem autenticacao. Roteado direto no dominio
// app (profissionalizamaisbrasil.com.br/placar): o proxy deixa passar qualquer
// path top-level que nao seja de vitrine.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Placar de Lançamento",
  description: "Acompanhe em tempo real as revendas ativas.",
  robots: { index: false, follow: false },
}

export default async function PlacarPage({
  searchParams,
}: {
  searchParams: Promise<{ teste?: string }>
}) {
  const [snapshot, params] = await Promise.all([
    getPlacarSnapshot(),
    searchParams,
  ])

  return (
    <PlacarClient initial={snapshot} testMode={params.teste !== undefined} />
  )
}
