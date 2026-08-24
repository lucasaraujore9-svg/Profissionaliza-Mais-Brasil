"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Pedaços de layout compartilhados pelos formulários de checkout da vitrine
 * (Asaas, Mercado Pago e a liberação gratuita). Eram três cópias idênticas —
 * a terceira nasceria com o formulário de matrícula sem cobrança.
 */

export function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
        {n}
      </div>
      <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
        {title}
      </h2>
    </div>
  )
}

export interface FieldTextProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: "text" | "numeric" | "tel" | "email"
  icon?: React.ComponentType<{ className?: string }>
  mono?: boolean
  required?: boolean
  disabled?: boolean
  error?: string
}

export function FieldText({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  icon: Icon,
  mono,
  required,
  disabled,
  error,
}: FieldTextProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        )}
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          className={`${Icon ? "pl-9" : ""} ${mono ? "font-mono" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
