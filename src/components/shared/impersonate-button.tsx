"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface Props {
  /** Endpoint POST que inicia a impersonação (retorna { data: { redirect } }). */
  endpoint: string
  label?: string
  busyLabel?: string
  fallbackRedirect?: string
}

/**
 * Botão genérico "Acessar como": dispara a impersonação no endpoint informado e
 * redireciona para a área do alvo (revenda → /painel; aluno → /aluno). Reusado
 * por admin→aluno, revendedor-vendedor→sub-revenda e revendedor→aluno.
 */
export function ImpersonateButton({
  endpoint,
  label = "Acessar como",
  busyLabel = "Acessando...",
  fallbackRedirect = "/painel",
}: Props) {
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    setBusy(true)
    try {
      const res = await fetch(endpoint, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível acessar")
        return
      }
      window.location.href = body.data?.redirect ?? fallbackRedirect
    } catch {
      toast.error("Erro de rede")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handle}
      disabled={busy}
      className="shrink-0 gap-1.5"
    >
      <LogIn className="h-3.5 w-3.5" />
      {busy ? busyLabel : label}
    </Button>
  )
}
