import { redirect } from "next/navigation"
import { DEFAULT_PAINEL_TAB } from "@/lib/reports/painel/tabs"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function PainelRelatoriosPage() {
  await requirePainelPage("relatorios.view")
  redirect(`/painel/relatorios/${DEFAULT_PAINEL_TAB}`)
}
