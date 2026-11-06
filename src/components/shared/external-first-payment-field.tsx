"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

/**
 * Venda parcelada cuja 1ª parcela foi paga fora (marketplace de cursos).
 * `paidAt` null = desligado.
 */
export function ExternalFirstPaymentField({
  paidAt,
  onChange,
}: {
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
        1ª parcela já paga fora da plataforma (marketplace)
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
            A 1ª parcela (a entrada, se houver) é registrada como paga e o curso é
            liberado na hora. As próximas o aluno paga pelo link, escolhendo PIX,
            boleto ou cartão.
          </p>
        </div>
      )}
    </div>
  )
}
