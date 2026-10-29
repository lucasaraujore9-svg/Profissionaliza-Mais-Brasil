"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function fmtYmd(ymd: string): string {
  return ymd.split("-").reverse().join("/")
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

/**
 * Curso mensal cuja 1ª mensalidade foi paga fora (marketplace de cursos).
 * `paidAt` null = desligado.
 */
export function ExternalFirstPaymentField({
  gateway,
  paidAt,
  onChange,
}: {
  gateway: "MP" | "ASAAS"
  paidAt: string | null
  onChange: (paidAt: string | null) => void
}) {
  return (
    <div className="mb-4 rounded-xl border border-gray-200 p-4">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-800">
        <input
          type="checkbox"
          checked={paidAt !== null}
          onChange={(e) => onChange(e.target.checked ? todayYmd() : null)}
        />
        1ª mensalidade já paga fora da plataforma (marketplace)
      </label>
      {paidAt !== null && (
        <div className="mt-3 space-y-2">
          <div className="max-w-[12rem]">
            <Label htmlFor="ext-paid-at">Data do pagamento no marketplace</Label>
            <Input
              id="ext-paid-at"
              type="date"
              value={paidAt}
              max={todayYmd()}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <p className="text-xs text-gray-600">
            A 1ª mensalidade é registrada como paga e o curso é liberado na hora.{" "}
            {gateway === "ASAAS"
              ? "As próximas ficam numa assinatura: envie o link ao aluno para ele cadastrar o pagamento — a 1ª cobrança vence um mês depois do pagamento no marketplace."
              : "As próximas viram boletos que o próprio sistema emite no Mercado Pago, mês a mês, a partir de um mês depois do pagamento no marketplace."}
          </p>
        </div>
      )}
    </div>
  )
}

export interface ExternalFirstSummary {
  gateway: "MP" | "ASAAS"
  months: number
  remaining: number
  monthlyAmount: number
  nextDueDate: string
}

export function ExternalFirstResult({ summary }: { summary: ExternalFirstSummary }) {
  return (
    <div className="rounded-2xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-6 text-[var(--color-pmb-green-900)]">
      <h2 className="text-base font-bold">
        Matrícula liberada — 1ª mensalidade registrada como paga
      </h2>
      <p className="mt-2 text-sm">
        {summary.gateway === "ASAAS" ? (
          <>
            Envie o link abaixo ao aluno: ali ele cadastra o pagamento das{" "}
            <strong>{summary.remaining} mensalidades seguintes</strong> de{" "}
            {brl(summary.monthlyAmount)}. A próxima vence em{" "}
            <strong>{fmtYmd(summary.nextDueDate)}</strong>. Até ele cadastrar, nada
            é cobrado — o link fica na ficha do aluno.
          </>
        ) : (
          <>
            <strong>{summary.remaining} boletos</strong> de{" "}
            {brl(summary.monthlyAmount)} agendados no Mercado Pago; o primeiro vence
            em <strong>{fmtYmd(summary.nextDueDate)}</strong>. Cada boleto fica
            disponível ao aluno 7 dias antes do vencimento.
          </>
        )}
      </p>
    </div>
  )
}
