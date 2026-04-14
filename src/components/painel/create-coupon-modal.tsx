"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateCouponModalProps {
  open: boolean
  onClose: () => void
}

export function CreateCouponModal({ open, onClose }: CreateCouponModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A2E]">
              Novo cupom de desconto
            </h2>
            <p className="text-xs text-gray-500">
              Configure regras de uso abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-6 py-6">
          <div>
            <Label htmlFor="cupom-codigo">Código</Label>
            <Input
              id="cupom-codigo"
              placeholder="EX: BEMVINDO10"
              className="mt-1.5 font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cupom-tipo">Tipo de desconto</Label>
              <select
                id="cupom-tipo"
                className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option>Porcentagem (%)</option>
                <option>Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="cupom-valor">Valor</Label>
              <Input
                id="cupom-valor"
                placeholder="10"
                className="mt-1.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cupom-inicio">Data início</Label>
              <Input id="cupom-inicio" type="date" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="cupom-fim">Data fim</Label>
              <Input id="cupom-fim" type="date" className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cupom-max">Uso máximo</Label>
              <Input
                id="cupom-max"
                placeholder="Ilimitado"
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="cupom-cursos">Cursos aplicáveis</Label>
              <select
                id="cupom-cursos"
                className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option>Todos os cursos</option>
                <option>Cursos específicos...</option>
              </select>
            </div>
          </div>
        </div>

        <footer className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            Criar cupom
          </Button>
        </footer>
      </div>
    </div>
  )
}
