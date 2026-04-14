import { Mail, Phone, MapPin, Building2, Calendar } from "lucide-react"

interface ResellerProfileProps {
  id: string
}

export function ResellerProfile({ id }: ResellerProfileProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow">
          EC
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-[#1A1A2E]">Educa+ Cursos LTDA</h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ativo
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 font-mono">ID: {id}</p>
          </div>

          <div className="grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              joao@educamaisbrasil.com
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              (11) 98765-4321
            </p>
            <p className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              CNPJ 12.345.678/0001-90
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              São Paulo — SP
            </p>
            <p className="flex items-center gap-2 sm:col-span-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              Cadastrado em 08/02/2026 — plano Growth (R$ 297/mês)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
