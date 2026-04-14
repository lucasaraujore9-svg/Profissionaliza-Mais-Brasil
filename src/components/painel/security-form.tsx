import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SecurityForm() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Alterar senha</h3>
      <p className="mt-1 text-xs text-gray-600">
        Use uma senha forte com pelo menos 8 caracteres.
      </p>

      <div className="mt-6 space-y-4 max-w-md">
        <div>
          <Label htmlFor="sec-atual">Senha atual</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-atual"
              type="password"
              placeholder="••••••••"
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sec-nova">Nova senha</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-nova"
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sec-confirm">Confirmar nova senha</Label>
          <div className="relative mt-1.5">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="sec-confirm"
              type="password"
              placeholder="Repita a nova senha"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="bg-blue-600 text-white hover:bg-blue-700">
          Atualizar senha
        </Button>
      </div>
    </div>
  )
}
