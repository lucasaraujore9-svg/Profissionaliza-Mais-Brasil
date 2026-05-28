"use client"

import { Building2, Briefcase, FileText, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EmpresaForm } from "./checkout-wizard"

function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

interface CheckoutFormEmpresaProps {
  value: EmpresaForm
  errors: Record<string, string>
  onChange: (value: EmpresaForm) => void
}

export function CheckoutFormEmpresa({
  value,
  errors,
  onChange,
}: CheckoutFormEmpresaProps) {
  const update = <K extends keyof EmpresaForm>(field: K, next: EmpresaForm[K]) => {
    onChange({ ...value, [field]: next })
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--color-pmb-green-900)] md:text-2xl">
        Dados da sua empresa
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Essas informações aparecerão no seu contrato e na nota fiscal de
        comissão.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="razao-social">Razão social</Label>
          <div className="relative mt-1.5">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="razao-social"
              placeholder="Ex: João Silva Educação LTDA"
              className="pl-9"
              value={value.razaoSocial}
              onChange={(e) => update("razaoSocial", e.target.value)}
              autoComplete="organization"
            />
          </div>
          {errors.razaoSocial && (
            <p className="mt-1 text-xs text-red-600">{errors.razaoSocial}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="fantasia">Nome fantasia</Label>
          <div className="relative mt-1.5">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="fantasia"
              placeholder="Ex: Educa+ Cursos"
              className="pl-9"
              value={value.fantasia}
              onChange={(e) => update("fantasia", e.target.value)}
            />
          </div>
          {errors.fantasia && (
            <p className="mt-1 text-xs text-red-600">{errors.fantasia}</p>
          )}
        </div>

        <div>
          <Label htmlFor="cnpj">CNPJ</Label>
          <div className="relative mt-1.5">
            <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="cnpj"
              placeholder="00.000.000/0000-00"
              className="pl-9"
              value={value.cnpj}
              onChange={(e) => update("cnpj", formatCnpj(e.target.value))}
            />
          </div>
          {errors.cnpj && <p className="mt-1 text-xs text-red-600">{errors.cnpj}</p>}
        </div>

        <div>
          <Label htmlFor="cidade">Cidade / UF</Label>
          <div className="relative mt-1.5">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="cidade"
              placeholder="São Paulo / SP"
              className="pl-9"
              value={value.cidade}
              onChange={(e) => update("cidade", e.target.value)}
              autoComplete="address-level2"
            />
          </div>
          {errors.cidade && <p className="mt-1 text-xs text-red-600">{errors.cidade}</p>}
        </div>
      </div>
    </div>
  )
}
