"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, Mail, MapPin, Phone } from "lucide-react"

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
  status: LeadStatus
  notes: string | null
  createdAt: string
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "LOST", label: "Perdido" },
]

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
}: {
  leads: RevendaLead[]
  apiBase: string
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
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {l.plan && (
                  <span className="rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 font-semibold text-[var(--color-pmb-green)]">
                    {l.plan}
                  </span>
                )}
                {l.source && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                    {l.source}
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

            <select
              value={l.status}
              disabled={saving === l.id}
              onChange={(e) => updateStatus(l.id, e.target.value as LeadStatus)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-pmb-green)] disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </li>
      ))}
    </ul>
  )
}
