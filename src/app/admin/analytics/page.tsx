import { redirect } from "next/navigation"

// O antigo /admin/analytics foi absorvido pelo hub de BI "Relatórios".
// Mantido como redirect para preservar links/bookmarks.
export default function AdminAnalyticsPage() {
  redirect("/admin/relatorios/visao-geral")
}
