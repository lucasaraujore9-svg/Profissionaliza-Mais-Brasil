import { Mail, Calendar, Globe, Link as LinkIcon } from "lucide-react"
import type { ResellerStatus } from "./reseller-table"

export interface ResellerProfileData {
  id: string
  name: string
  slug: string
  status: ResellerStatus
  email: string | null
  ownerName: string | null
  planValue: number
  customDomain: string | null
  createdAt: string
}

interface ResellerProfileProps {
  reseller: ResellerProfileData
}

const STATUS_STYLES: Record<ResellerStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-200 text-gray-600",
}

const STATUS_LABEL: Record<ResellerStatus, string> = {
  ACTIVE: "ativo",
  PENDING: "pendente",
  SUSPENDED: "suspenso",
  CANCELLED: "cancelado",
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return iso
  }
}

function formatMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ResellerProfile({ reseller }: ResellerProfileProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow">
          {initials(reseller.name) || "R"}
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-[#1A1A2E]">{reseller.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[reseller.status]}`}
              >
                {STATUS_LABEL[reseller.status]}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-gray-500">ID: {reseller.id}</p>
          </div>

          <div className="grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
            {reseller.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                {reseller.email}
              </p>
            )}
            <p className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-gray-400" />
              {reseller.slug}
            </p>
            {reseller.customDomain && (
              <p className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-gray-400" />
                {reseller.customDomain}
              </p>
            )}
            <p className="flex items-center gap-2 sm:col-span-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              Cadastrado em {formatDate(reseller.createdAt)} — mensalidade {formatMoney(reseller.planValue)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
