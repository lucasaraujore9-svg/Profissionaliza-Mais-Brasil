"use client"

import { User, Mail, Phone, FileText, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PessoalForm } from "./checkout-wizard"

function formatCpf(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2")
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
}

interface CheckoutFormPessoalProps {
  value: PessoalForm
  errors: Record<string, string>
  onChange: (value: PessoalForm) => void
}

export function CheckoutFormPessoal({
  value,
  errors,
  onChange,
}: CheckoutFormPessoalProps) {
  const update = <K extends keyof PessoalForm>(field: K, next: PessoalForm[K]) => {
    onChange({ ...value, [field]: next })
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--color-pmb-green-900)] md:text-2xl">
        Seus dados pessoais
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Precisamos dessas informações para cadastrar seu acesso de revendedor.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="nome">Nome completo</Label>
          <div className="relative mt-1.5">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="nome"
              placeholder="Ex: João da Silva"
              className="pl-9"
              value={value.nome}
              onChange={(e) => update("nome", e.target.value)}
            />
          </div>
          {errors.nome && <p className="mt-1 text-xs text-red-600">{errors.nome}</p>}
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
              type="email"
              placeholder="voce@empresa.com"
              className="pl-9"
              value={value.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>

        <div>
          <Label htmlFor="telefone">Celular</Label>
          <div className="relative mt-1.5">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="telefone"
              placeholder="(11) 99999-9999"
              className="pl-9"
              value={value.telefone}
              onChange={(e) => update("telefone", formatPhone(e.target.value))}
            />
          </div>
          {errors.telefone && <p className="mt-1 text-xs text-red-600">{errors.telefone}</p>}
        </div>

        <div>
          <Label htmlFor="cpf">CPF</Label>
          <div className="relative mt-1.5">
            <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              className="pl-9"
              value={value.cpf}
              onChange={(e) => update("cpf", formatCpf(e.target.value))}
            />
          </div>
          {errors.cpf && <p className="mt-1 text-xs text-red-600">{errors.cpf}</p>}
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="password">Crie uma senha</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="pl-9"
              value={value.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password}</p>
          )}
        </div>
      </div>
    </div>
  )
}
