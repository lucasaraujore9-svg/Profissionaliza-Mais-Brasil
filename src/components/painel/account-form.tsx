import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AccountForm() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">
        Dados da conta
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Seus dados pessoais e da empresa cadastrada na plataforma.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="cfg-nome">Nome completo</Label>
          <Input
            id="cfg-nome"
            defaultValue="João Silva"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cfg-email">Email</Label>
          <Input
            id="cfg-email"
            type="email"
            defaultValue="joao@educamaisbrasil.com"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cfg-empresa">Razão social</Label>
          <Input
            id="cfg-empresa"
            defaultValue="Educa+ Cursos LTDA"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cfg-cnpj" className="flex items-center gap-1">
            CNPJ
            <Lock className="h-3 w-3 text-gray-400" />
          </Label>
          <Input
            id="cfg-cnpj"
            defaultValue="12.345.678/0001-90"
            readOnly
            className="mt-1.5 bg-gray-50 font-mono"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="bg-blue-600 text-white hover:bg-blue-700">
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
