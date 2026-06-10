"use client"

import Link from "next/link"

/**
 * Aceite obrigatório dos Termos de Uso e da Política de Privacidade no
 * checkout. Os links são relativos (`/termos`, `/privacidade`) — em uma vitrine
 * de revendedor resolvem para a página tenant-aware do próprio domínio da loja;
 * no site PMB, para a página institucional. Abrem em nova aba para não perder o
 * preenchimento do checkout.
 */
export function TermsAcceptance({
  checked,
  onChange,
  disabled,
  error,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  error?: boolean
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[var(--color-pmb-green)] accent-[var(--color-pmb-green)] focus:ring-2 focus:ring-[var(--color-pmb-green)]"
          aria-invalid={error || undefined}
        />
        <span className="text-xs leading-relaxed text-gray-600">
          Li e concordo com os{" "}
          <Link
            href="/termos"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--color-pmb-green)] underline underline-offset-2"
          >
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link
            href="/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--color-pmb-green)] underline underline-offset-2"
          >
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {error && (
        <p className="mt-1.5 text-xs text-red-600">
          Você precisa aceitar os Termos de Uso e a Política de Privacidade para
          concluir a compra.
        </p>
      )}
    </div>
  )
}
