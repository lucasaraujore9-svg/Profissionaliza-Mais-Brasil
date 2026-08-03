import { Mail, Calendar, Globe, Link as LinkIcon, Phone } from "lucide-react"
import { formatPhone } from "@/lib/validation/phone"
import type { ResellerStatus } from "./reseller-table"
import { ResellerStatusBadge } from "./reseller-status"
import { ResellerImpersonateButton } from "./reseller-impersonate-button"

export interface ResellerProfileData {
  id: string
  name: string
  slug: string
  status: ResellerStatus
  email: string | null
  ownerName: string | null
  /** Telefone do titular, como informado no cadastro da unidade. */
  ownerPhone: string | null
  planValue: number
  customDomain: string | null
  createdAt: string
}

interface ResellerProfileProps {
  reseller: ResellerProfileData
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
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-700)] text-2xl font-bold text-white shadow">
          {initials(reseller.name) || "R"}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--color-pmb-green-900)]">{reseller.name}</h2>
                <ResellerStatusBadge status={reseller.status} />
              </div>
              <p className="mt-1 font-mono text-xs text-gray-500">ID: {reseller.id}</p>
            </div>
            <ResellerImpersonateButton tenantId={reseller.id} />
          </div>

          <div className="grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
            {reseller.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                {reseller.email}
              </p>
            )}
            {reseller.ownerPhone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                {formatPhone(reseller.ownerPhone)}
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
              Cadastrado em {formatDate(reseller.createdAt)} — mensalidade{" "}
              <span className="font-mono">{formatMoney(reseller.planValue)}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
