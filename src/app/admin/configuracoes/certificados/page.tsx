import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// Pagina unificada em /admin/certificados/configuracoes.
// Mantida pra nao quebrar bookmarks/links antigos.
export default function AdminConfiguracoesCertificadosRedirect() {
  redirect("/admin/certificados/configuracoes")
}
