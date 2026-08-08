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

export type CortesiaRetryResult =
  | { ok: true }
  /**
   * `error` é exibido DENTRO do diálogo. O componente pai também guarda a
   * mensagem no estado dele, mas aquele banner renderiza ATRÁS do overlay do
   * modal — o operador via o botão voltar ao normal sem explicação nenhuma e
   * clicava de novo.
   */
  | { ok: false; error?: string }

export interface CortesiaPrompt {
  /** Mensagem que a API devolveu no 403 — já explica o que está sendo liberado. */
  message: string
  /**
   * Refaz a chamada, agora com a justificativa. Em caso de falha o diálogo tem
   * que CONTINUAR aberto — se sumisse, o usuário concluiria que deu certo.
   */
  retry: (reason: string) => Promise<CortesiaRetryResult>
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
  const [error, setError] = useState<string | null>(null)

  // Cada nova solicitação começa com o campo limpo — reaproveitar a
  // justificativa anterior seria registrar um motivo que ninguém escreveu.
  useEffect(() => {
    if (prompt) {
      setReason("")
      setError(null)
    }
  }, [prompt])

  const trimmed = reason.trim()
  const tooShort = trimmed.length < MIN_REASON

  async function confirm() {
    if (!prompt || tooShort || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await prompt.retry(trimmed)
      if (result.ok) onClose()
      else setError(result.error ?? "Não foi possível concluir. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog
      open={Boolean(prompt)}
      // Enquanto a requisição está em voo, o diálogo NÃO fecha — nem por
      // Escape, nem por clique fora. O botão Cancelar já ficava desabilitado,
      // mas o Escape continuava passando: a janela sumia como se tivesse
      // abortado e a cortesia era concedida assim mesmo no servidor.
      onOpenChange={(o) => {
        if (!o && !saving) onClose()
      }}
    >
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
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
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
