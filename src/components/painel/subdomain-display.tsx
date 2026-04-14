import { Globe, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SubdomainDisplay() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
        <Globe className="h-3.5 w-3.5" />
        Seu subdomínio oficial
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-lg font-bold text-[#1A1A2E] sm:text-xl">
          educamaisbrasil
          <span className="text-gray-500">.profissionalizamaisbrasil.com.br</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline">
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copiar
          </Button>
          <Button size="sm" variant="outline">
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Abrir
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        Esse endereço é gratuito e sempre estará disponível. Você pode também
        apontar um domínio próprio abaixo.
      </div>
    </div>
  )
}
