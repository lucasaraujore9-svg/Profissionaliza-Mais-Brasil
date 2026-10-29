"use client"

import { Input } from "@/components/ui/input"

/** "1.234,56" / "89,9" -> número (0 quando vazio ou inválido). */
export function parseBrl(v: string): number {
  const n = Number(v.trim().replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

/**
 * Valores efetivos do carnê: `custom[i]` quando a pessoa personalizou, senão o
 * valor padrão de cada parcela. Sempre `count` itens.
 */
export function effectiveInstallmentAmounts(
  count: number,
  defaultValue: string,
  custom: string[] | null,
): number[] {
  return Array.from({ length: count }, (_, i) => parseBrl(custom?.[i] ?? defaultValue))
}

/**
 * Personalização do carnê na venda: entrada diferente e/ou valores próprios por
 * parcela. Desligado, todas as parcelas valem o "valor de cada parcela".
 * `custom` null = desligado.
 */
export function InstallmentAmountsField({
  count,
  defaultValue,
  custom,
  onChange,
}: {
  count: number
  defaultValue: string
  custom: string[] | null
  onChange: (custom: string[] | null) => void
}) {
  return (
    <div className="sm:col-span-3">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
        <input
          type="checkbox"
          checked={custom !== null}
          onChange={(e) =>
            onChange(e.target.checked ? Array.from({ length: count }, () => defaultValue) : null)
          }
        />
        Personalizar valores (entrada diferente, parcelas com valores próprios)
      </label>
      {custom !== null && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: count }, (_, i) => (
            <div key={i}>
              <span className="text-[11px] text-gray-500">
                {i === 0 ? "1ª parcela (entrada)" : `${i + 1}ª parcela`}
              </span>
              <Input
                inputMode="decimal"
                className="mt-0.5 h-9"
                value={custom[i] ?? defaultValue}
                onChange={(e) => {
                  const next = Array.from({ length: count }, (_, j) => custom[j] ?? defaultValue)
                  next[i] = e.target.value
                  onChange(next)
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
