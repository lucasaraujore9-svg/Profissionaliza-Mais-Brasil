"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

export interface ScopedCard {
  label: string
  value: string
  sub?: string
  accent?: "green" | "amber" | "red" | "gray"
}

export interface ScopedUnit {
  id: string
  name: string
  slug: string
  status: string
  students: number
}

export interface ScopedLead {
  id: string
  companyName: string
  status: string
  createdAt: string
}

export interface ScopedDashboardData {
  variant: "revenda" | "suporte" | "vendas"
  title: string
  cards: ScopedCard[]
  units?: ScopedUnit[]
  leads?: ScopedLead[]
}

const ACCENT: Record<NonNullable<ScopedCard["accent"]>, string> = {
  green: "text-[var(--color-pmb-green)]",
  amber: "text-amber-600",
  red: "text-rose-600",
  gray: "text-gray-900",
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Aguardando", cls: "bg-amber-100 text-amber-700" },
  SUSPENDED: { label: "Suspensa", cls: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "Cancelada", cls: "bg-gray-100 text-gray-600" },
  NEW: { label: "Novo", cls: "bg-sky-100 text-sky-700" },
  CONTACTED: { label: "Contatado", cls: "bg-violet-100 text-violet-700" },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? {
    label: status,
    cls: "bg-gray-100 text-gray-600",
  }
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        s.cls,
      )}
    >
      {s.label}
    </span>
  )
}

export function ScopedDashboard({ data }: { data: ScopedDashboardData }) {
  return (
    <div className="space-y-6">
      <div
        className={cn(
          "grid gap-4",
          data.cards.length >= 4
            ? "sm:grid-cols-2 xl:grid-cols-4"
            : "sm:grid-cols-3",
        )}
      >
        {data.cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {c.label}
            </p>
            <p
              className={cn(
                "mt-2 text-3xl font-bold",
                ACCENT[c.accent ?? "gray"],
              )}
            >
              {c.value}
            </p>
            {c.sub && <p className="mt-1 text-xs text-gray-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "grid gap-6",
          data.leads ? "xl:grid-cols-2" : "grid-cols-1",
        )}
      >
        {data.units && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Unidades</h2>
              <Link
                href="/admin/revendedores"
                className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Ver todas
              </Link>
            </header>
            {data.units.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">
                Nenhuma unidade atribuída ainda.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.units.map((u) => (
                  <li key={u.id}>
                    <Link
                      href={`/admin/revendedores/${u.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {u.name}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {u.slug} · {u.students} aluno(s)
                        </p>
                      </div>
                      <StatusBadge status={u.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {data.leads && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Leads em aberto
              </h2>
              <Link
                href="/admin/leads-revenda"
                className="text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Ver funil
              </Link>
            </header>
            {data.leads.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">
                Nenhum lead em aberto.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.leads.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <p className="min-w-0 truncate text-sm font-medium text-gray-900">
                      {l.companyName || "—"}
                    </p>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
