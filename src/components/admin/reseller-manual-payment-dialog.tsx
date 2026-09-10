"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const INPUT =
  "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function competenciaLabel(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  if (!m) return p
  return `${m[2]}/${m[1]}`
}

interface Resultado {
  created: { competencia: string; dueDate: string }[]
  skipped: string[]
  total: number
}

/**
 * BAIXA FINANCEIRA MANUAL de mensalidade recebida FORA da plataforma.
 *
 * O operador informa o valor de UMA mensalidade e QUANTAS ela cobre — nao o
 * total pago. Adiantamento de tres meses vira tres lancamentos nas competencias
 * deles, e nao um lancamento somado: e isso que faz a comissao do indicador sair
 * mes a mes e a varredura de inadimplencia nao suspender a unidade num mes que
 * ela ja pagou.
 */
export function ResellerManualPaymentDialog({
  tenantId,
  tenantName,
  planValue,
  onDone,
}: {
  tenantId: string
  tenantName: string
  /** Mensalidade da unidade — preenche o campo, mas o operador pode mudar. */
  planValue: number
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(planValue || ""))
  const [months, setMonths] = useState("1")
  const [firstDueDate, setFirstDueDate] = useState(hoje())
  const [paidAt, setPaidAt] = useState(hoje())
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const valorNum = Number(amount.replace(",", "."))
  const mesesNum = Number(months)
  const totalPrevisto =
    Number.isFinite(valorNum) && Number.isFinite(mesesNum)
      ? valorNum * mesesNum
      : 0

  function fechar() {
    setOpen(false)
    setError(null)
    setResultado(null)
    setNote("")
    setMonths("1")
  }

  async function salvar() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/pagamento-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: valorNum,
            months: mesesNum,
            firstDueDate,
            paidAt,
            note: note.trim() || null,
          }),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Não foi possível registrar o pagamento.")
        return
      }
      setResultado(body.data as Resultado)
      onDone?.()
    } catch {
      setError("Erro de rede ao registrar o pagamento.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Baixa manual
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : fechar())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resultado ? "Pagamento registrado" : "Baixa financeira manual"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resultado
                ? `${tenantName} — o valor já conta para comissão de indicação e para a apuração de inadimplência.`
                : `Mensalidade de ${tenantName} recebida fora da plataforma (PIX direto, transferência, dinheiro). Use quando a cobrança do Asaas foi cancelada e não há como dar baixa nela.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {resultado ? (
            <div className="space-y-3 text-sm">
              <ul className="space-y-1">
                {resultado.created.map((c) => (
                  <li key={c.competencia} className="flex justify-between gap-4">
                    <span className="text-gray-600">
                      Competência {competenciaLabel(c.competencia)}
                    </span>
                    <span className="font-mono text-xs text-gray-500">
                      venc. {c.dueDate.split("-").reverse().join("/")}
                    </span>
                  </li>
                ))}
              </ul>
              {resultado.skipped.length > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {resultado.skipped.length === 1 ? "A competência " : "As competências "}
                  {resultado.skipped.map(competenciaLabel).join(", ")}
                  {resultado.skipped.length === 1 ? " já tinha" : " já tinham"}{" "}
                  mensalidade paga e {resultado.skipped.length === 1 ? "foi" : "foram"}{" "}
                  puladas — lançar de novo criaria receita que não existe.
                </p>
              )}
              <p className="text-xs text-gray-600">
                Total registrado:{" "}
                <strong>
                  {resultado.total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </strong>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Valor de UMA mensalidade
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Quantas mensalidades
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Vencimento da primeira
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  Pago em
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className={INPUT}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Observação (opcional)
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: PIX recebido na conta da PMB, comprovante no e-mail"
                  className={INPUT}
                />
              </label>

              {mesesNum > 1 && (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Serão criados <strong>{mesesNum} lançamentos</strong> de{" "}
                  {valorNum.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  , um por mês a partir do vencimento informado — total de{" "}
                  <strong>
                    {totalPrevisto.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                  . Cada um conta na competência dele, então a comissão de
                  indicação sai mês a mês.
                </p>
              )}

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {resultado ? (
              <Button onClick={fechar}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={fechar} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  onClick={salvar}
                  disabled={saving || !(valorNum > 0) || !(mesesNum >= 1)}
                >
                  {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Registrar pagamento
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
