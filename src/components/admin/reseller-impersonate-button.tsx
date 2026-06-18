"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface Props {
  tenantId: string
}

export function ResellerImpersonateButton({ tenantId }: Props) {
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/impersonate`,
        { method: "POST" },
      )
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao acessar como revendedor")
        return
      }
      window.location.href = body.data?.redirect ?? "/painel"
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
      {busy ? "Acessando..." : "Acessar painel"}
    </Button>
  )
}
