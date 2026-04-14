"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface CourseEditDrawerProps {
  open: boolean
  onClose: () => void
}

export function CourseEditDrawer({ open, onClose }: CourseEditDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A2E]">
              Editar curso
            </h2>
            <p className="text-xs text-gray-500">Altere as configurações abaixo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 px-6 py-6">
          <div>
            <Label htmlFor="edit-titulo">Título</Label>
            <Input
              id="edit-titulo"
              defaultValue="Excel Avançado — Do Zero ao PROCV"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="edit-descricao">Descrição</Label>
            <Textarea
              id="edit-descricao"
              rows={4}
              defaultValue="Domine fórmulas avançadas, tabelas dinâmicas e PROCV em poucas semanas."
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-preco">Preço</Label>
              <Input
                id="edit-preco"
                defaultValue="R$ 267,00"
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="edit-tipo">Tipo</Label>
              <select
                id="edit-tipo"
                className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                defaultValue="Único"
              >
                <option>Único</option>
                <option>Recorrente</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[#1A1A2E]">
                Visível na vitrine
              </div>
              <div className="text-xs text-gray-500">
                Desative para ocultar sem deletar o curso.
              </div>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
          </label>
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
            Salvar
          </Button>
        </footer>
      </aside>
    </div>
  )
}
