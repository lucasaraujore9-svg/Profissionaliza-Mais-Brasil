"use client"

import { User, Mail, IdCard, Phone, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function StudentForm() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 font-mono text-sm font-semibold text-blue-600">
          01
        </div>
        <h2 className="text-base font-semibold text-[#1A1A2E]">Seus dados</h2>
      </div>

      <form className="mt-6 space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <Label htmlFor="nome">Nome completo</Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              id="nome"
              placeholder="Como aparece no seu documento"
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="voce@email.com"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="telefone"
                type="tel"
                placeholder="(11) 99999-9999"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <div className="relative">
            <IdCard className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              className="pl-9 font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="endereco">Endereço completo</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              id="endereco"
              placeholder="Rua, número, bairro, cidade, UF"
              className="pl-9"
            />
          </div>
        </div>
      </form>
    </div>
  )
}
