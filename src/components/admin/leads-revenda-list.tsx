"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, Globe, IdCard, Mail, MapPin, Phone, UserPlus } from "lucide-react"
import { NewResellerDialog } from "@/components/admin/new-reseller-dialog"

export type LeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "LOST"

export interface RevendaLead {
  id: string
  email: string
  companyName: string
  phone: string
  plan: string | null
  city: string | null
  state: string | null
  source: string | null
  /** CPF do interessado (só dígitos) — capturado no form /lp-revenda2. */
  cpf: string | null
  /** Subdomínio desejado para a vitrine — capturado no form /lp-revenda2. */
  slug: string | null
  status: LeadStatus
  notes: string | null
  createdAt: string
  /** Nome do revendedor que indicou este lead (se houve indicação). */
  referrerName: string | null
  /** Tenant criado quando o lead foi convertido em revenda. */
  convertedTenantId: string | null
  /** Vendedor de revenda dono deste lead (rodízio ou atribuição manual). */
  ownerUserId: string | null
  ownerName: string | null
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "LOST", label: "Perdido" },
]

function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "")
  if (d.length !== 11) return value
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function LeadsRevendaList({
  leads,
  apiBase,
  canConvert = false,
  convertHrefBase,
}: {
  leads: RevendaLead[]
  apiBase: string
  /** Só quem pode criar revenda — controla o botão "Converter". */
  canConvert?: boolean
  /**
   * Quando definido, "Converter" vira um link para o form pré-preenchido
   * (`${convertHrefBase}?leadId=…`) — fluxo do painel do revendedor-vendedor.
   * Sem ele (admin), usa o diálogo NewResellerDialog.
   */
  convertHrefBase?: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)

  async function updateStatus(id: string, status: LeadStatus) {
    setSaving(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        toast.error("Não foi possível atualizar o status.")
        return
      }
      toast.success("Status atualizado.")
      router.refresh()
    } catch {
      toast.error("Falha de conexão. Tente de novo.")
    } finally {
      setSaving(null)
    }
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <Building2 className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-[var(--color-pmb-green-900)]">
          Nenhum lead de revenda por aqui
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Interessados que preenchem o formulário de “Seja revendedor”
          aparecem nesta lista.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {leads.map((l) => (
        <li
          key={l.id}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
                {l.companyName}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <a
                  href={`mailto:${l.email}`}
                  className="inline-flex items-center gap-1 hover:text-[var(--color-pmb-green)]"
                >
                  <Mail className="h-3.5 w-3.5" /> {l.email}
                </a>
                {l.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {l.phone}
                  </span>
                )}
                {(l.city || l.state) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[l.city, l.state].filter(Boolean).join("/")}
                  </span>
                )}
                {l.cpf && (
                  <span className="inline-flex items-center gap-1">
                    <IdCard className="h-3.5 w-3.5" /> {formatCpf(l.cpf)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {l.plan && (
                  <span className="rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 font-semibold text-[var(--color-pmb-green)]">
                    {l.plan}
                  </span>
                )}
                {l.slug && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                    <Globe className="h-3 w-3" aria-hidden />
                    {l.slug}.livrecursos.com.br
                  </span>
                )}
                {l.source && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                    {l.source}
                  </span>
                )}
                {l.referrerName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                    <UserPlus className="h-3 w-3" aria-hidden />
                    Indicado por {l.referrerName}
                  </span>
                )}
                <span className="text-gray-400">{formatDate(l.createdAt)}</span>
              </div>
              {l.notes && (
                <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
                  {l.notes}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <select
                value={l.status}
                disabled={saving === l.id}
                onChange={(e) =>
                  updateStatus(l.id, e.target.value as LeadStatus)
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-pmb-green)] disabled:opacity-60"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              {canConvert &&
                (l.convertedTenantId || l.status === "CONVERTED" ? (
                  <span className="text-[11px] font-semibold text-gray-400">
                    Convertido em revenda
                  </span>
                ) : convertHrefBase ? (
                  <Link
                    href={`${convertHrefBase}?leadId=${l.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-lime-50)]"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Converter em revenda
                  </Link>
                ) : (
                  <NewResellerDialog
                    onCreated={() => router.refresh()}
                    leadId={l.id}
                    triggerLabel="Converter em revenda"
                    triggerVariant="outline"
                    initialValues={{
                      name: l.companyName,
                      ownerName: l.companyName,
                      ownerEmail: l.email,
                      ownerPhone: l.phone,
                    }}
                  />
                ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
