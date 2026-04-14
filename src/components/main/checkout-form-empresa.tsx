import { Building2, Briefcase, FileText, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CheckoutFormEmpresa() {
  return (
    <div>
      <h2 className="text-xl font-bold text-[#1A1A2E] md:text-2xl">
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
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="fantasia">Nome fantasia</Label>
          <div className="relative mt-1.5">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="fantasia"
              placeholder="Ex: Educa+ Cursos"
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cnpj">CNPJ</Label>
          <div className="relative mt-1.5">
            <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="cnpj"
              placeholder="00.000.000/0000-00"
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cidade">Cidade / UF</Label>
          <div className="relative mt-1.5">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input id="cidade" placeholder="São Paulo / SP" className="pl-9" />
          </div>
        </div>
      </div>
    </div>
  )
}
