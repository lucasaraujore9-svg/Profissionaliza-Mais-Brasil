import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// Pagina descontinuada — pagamento agora e automatico no dia X do mes seguinte.
// Mantida apenas para nao quebrar bookmarks antigos; redireciona ao hub.
export default function PainelIndicacoesSacarPage() {
  redirect("/painel/indicacoes")
}
