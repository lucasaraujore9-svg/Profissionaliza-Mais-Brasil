import { Pause, Play, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ResellerActionButtons() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">Ações</h3>
      <p className="mt-1 text-xs text-gray-600">
        Operações administrativas que afetam o status da assinatura.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1">
          <Pause className="mr-2 h-4 w-4" />
          Suspender
        </Button>
        <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700">
          <Play className="mr-2 h-4 w-4" />
          Ativar
        </Button>
        <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50">
          <Ban className="mr-2 h-4 w-4" />
          Cancelar assinatura
        </Button>
      </div>
    </div>
  )
}
