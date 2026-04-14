import { User, Mail, Phone, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CheckoutFormPessoal() {
  return (
    <div>
      <h2 className="text-xl font-bold text-[#1A1A2E] md:text-2xl">
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
            <Input id="nome" placeholder="Ex: João da Silva" className="pl-9" />
          </div>
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
            />
          </div>
        </div>

        <div>
          <Label htmlFor="telefone">Celular</Label>
          <div className="relative mt-1.5">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="telefone"
              placeholder="(11) 99999-9999"
              className="pl-9"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="cpf">CPF</Label>
          <div className="relative mt-1.5">
            <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input id="cpf" placeholder="000.000.000-00" className="pl-9" />
          </div>
        </div>
      </div>
    </div>
  )
}
