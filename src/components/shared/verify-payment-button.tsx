"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/**
 * "Verificar pagamento": pergunta ao gateway se a cobrança pendente já foi paga
 * e, se foi, efetiva a matrícula na hora.
 *
 * O caminho normal é o webhook. Quando ele não chega — webhook não cadastrado na
 * conta do gateway da unidade, fila interrompida pelo próprio gateway após
 * falhas, evento perdido — a venda paga ficava PENDING sem nenhuma saída manual:
 * aluno sem acesso e ninguém no painel conseguindo destravar. Este botão é essa
 * saída, e nunca confia no clique: quem decide é a resposta do gateway.
 *
 * Serve às duas gestões (unidade e sistema mãe) via `url` — cada uma passa o
 * próprio endpoint, com a própria matriz de permissão.
 */
interface VerifyPaymentButtonProps {
  /** Endpoint POST de verificação (admin ou painel). */
  url: string
  label?: string
  className?: string
}

export function VerifyPaymentButton({
  url,
  label = "Verificar pagamento",
  className,
}: VerifyPaymentButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function verify() {
    setLoading(true)
    try {
      const res = await fetch(url, { method: "POST" })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(body.error ?? `Falha ao verificar o pagamento (${res.status})`)
        return
      }

      const status = body.data?.status
      if (status === "confirmed") {
        toast.success(
          body.data?.alreadyProcessed
            ? "Este pagamento já estava confirmado."
            : "Pagamento confirmado — matrícula liberada e acesso provisionado.",
        )
        router.refresh()
        return
      }
      if (status === "unsupported") {
        toast.warning(
          "Não há como verificar esta cobrança automaticamente. Confira direto no painel do gateway.",
        )
        return
      }
      // "pending": o gateway respondeu e não há pagamento confirmado. Dizer isso
      // com todas as letras evita o clique repetido e o "o sistema não achou".
      toast.info("O gateway ainda não registra pagamento confirmado nesta cobrança.")
    } catch {
      toast.error("Erro de rede ao verificar o pagamento")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={verify}
      className={className}
    >
      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Verificando…" : label}
    </Button>
  )
}
