"use client"

import { useState, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/** Espelha `MIN_REASON_LENGTH`/`MAX_REASON_LENGTH` de `lib/tenants/lifecycle`. */
const MIN_REASON = 10
const MAX_REASON = 500

export interface CortesiaPrompt {
  /** Mensagem que a API devolveu no 403 — já explica o que está sendo liberado. */
  message: string
  /**
   * Refaz a chamada, agora com a justificativa. Devolve `true` só quando a
   * operação passou — em caso de falha o diálogo tem que CONTINUAR aberto, ou o
   * usuário vê a janela sumir e conclui que deu certo.
   */
  retry: (reason: string) => Promise<boolean>
}

/**
 * Segundo passo da cortesia excepcional.
 *
 * A API responde 403 com `requiresReason: true` quando quem chamou TEM a
 * permissão e só falta justificar. Isso separa dois casos que um erro seco
 * confundiria: "você não pode" e "você pode, mas isto fica registrado". O texto
 * digitado vai para `audit_logs` junto com quem liberou.
 */
export function CortesiaReasonDialog({
  prompt,
  onClose,
}: {
  prompt: CortesiaPrompt | null
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  // Cada nova solicitação começa com o campo limpo — reaproveitar a
  // justificativa anterior seria registrar um motivo que ninguém escreveu.
  useEffect(() => {
    if (prompt) setReason("")
  }, [prompt])

  const trimmed = reason.trim()
  const tooShort = trimmed.length < MIN_REASON

  async function confirm() {
    if (!prompt || tooShort) return
    setSaving(true)
    try {
      if (await prompt.retry(trimmed)) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog open={Boolean(prompt)} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Liberar cortesia excepcional
          </AlertDialogTitle>
          <AlertDialogDescription>{prompt?.message}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
            placeholder="Ex.: unidade renegociou e vai pagar por PIX até sexta"
            rows={3}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {tooShort
              ? `Faltam ${MIN_REASON - trimmed.length} caractere(s).`
              : `${trimmed.length}/${MAX_REASON} · fica registrado na auditoria com o seu nome.`}
          </p>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={tooShort || saving}>
            {saving ? "Liberando..." : "Liberar mesmo assim"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
