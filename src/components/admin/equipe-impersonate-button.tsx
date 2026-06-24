"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface Props {
  userId: string
  /** Nome exibido na confirmação. */
  userName?: string
}

/**
 * Botão "Entrar como" exibido só para SUPER_ADMIN (o backend reforça). Inicia a
 * impersonação de um membro interno da equipe PMB e redireciona para o destino
 * do papel dele. A saída é pelo banner de impersonação (mesmo de revenda/aluno).
 */
export function EquipeImpersonateButton({ userId, userName }: Props) {
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    if (
      !window.confirm(
        `Entrar como ${userName ?? "este usuário"}? Você verá o sistema como ele e toda ação afeta os dados reais.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/equipe/${userId}/impersonate`, {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao entrar como usuário")
        return
      }
      window.location.href = body.data?.redirect ?? "/admin"
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
      className="shrink-0"
    >
      <LogIn className="h-3.5 w-3.5" />
      {busy ? "Acessando..." : "Entrar como"}
    </Button>
  )
}
