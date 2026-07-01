import { redirect } from "next/navigation"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { DEFAULT_PAINEL_TAB } from "@/lib/reports/painel/tabs"

export const dynamic = "force-dynamic"

export default async function PainelRelatoriosPage() {
  const ctx = await requireResellerSession()
  if (!ctx) redirect("/login?callbackUrl=/painel/relatorios")
  redirect(`/painel/relatorios/${DEFAULT_PAINEL_TAB}`)
}
