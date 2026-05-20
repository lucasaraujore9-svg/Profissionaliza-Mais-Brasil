"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { vitrineHost } from "@/lib/tenant/urls"

interface TenantOption {
  id: string
  slug: string
  name: string
}

interface StudentItem {
  id: string
  nome: string
  email: string | null
  fone: string | null
  cpf: string | null
  status: string
  eaAlunoId: string | null
  createdAt: string
  tenant: { id: string; slug: string; name: string; isPmbDirect: boolean }
  activeEnrollments: number
}

interface GlobalResponse {
  data: { students: StudentItem[]; tenants: TenantOption[] }
}

const STATUS_COLORS: Record<string, string> = {
  ATIVO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INATIVO: "bg-gray-100 text-gray-600 border-gray-200",
  BLOQUEADO: "bg-rose-50 text-rose-700 border-rose-200",
  DEVEDOR: "bg-amber-50 text-amber-700 border-amber-200",
  FORMADO: "bg-cyan-50 text-cyan-700 border-cyan-200",
  INTERESSADO: "bg-sky-50 text-sky-700 border-sky-200",
}

export function GlobalStudentsClient() {
  const [q, setQ] = useState("")
  const [tenantFilter, setTenantFilter] = useState<string>("all")
  const [data, setData] = useState<GlobalResponse["data"] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        if (tenantFilter !== "all") params.set("tenant", tenantFilter)
        const res = await fetch(
          `/api/admin/alunos/global?${params.toString()}`,
          { signal: controller.signal },
        )
        if (res.ok) {
          const body = (await res.json()) as GlobalResponse
          setData(body.data)
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // ignore
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [q, tenantFilter])

  const counters = useMemo(() => {
    if (!data) return { total: 0, pmb: 0, revendas: 0 }
    let pmb = 0
    let revendas = 0
    for (const s of data.students) {
      if (s.tenant.isPmbDirect) pmb += 1
      else revendas += 1
    }
    return { total: data.students.length, pmb, revendas }
  }, [data])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Counter label="Total visível" value={counters.total} />
        <Counter
          label="Vitrine PMB (direto)"
          value={counters.pmb}
          accent="text-[var(--color-pmb-green)]"
        />
        <Counter
          label="Revendedores"
          value={counters.revendas}
          accent="text-[var(--color-pmb-cyan)]"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex-1">
          <Input
            placeholder="Buscar por email, nome ou CPF"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm md:w-72"
        >
          <option value="all">Todas as origens</option>
          <option value="__pmb__">Apenas vitrine PMB</option>
          <optgroup label="Revendedores">
            {data?.tenants
              .filter((t) => t.slug !== "__pmb__")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex items-center justify-center p-10 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando alunos...
          </div>
        ) : !data || data.students.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Nenhum aluno encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-gray-600">
                  <th className="px-4 py-2.5">Aluno</th>
                  <th className="px-4 py-2.5">Origem</th>
                  <th className="px-4 py-2.5">Contato</th>
                  <th className="px-4 py-2.5">Cursos ativos</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Cadastrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.students.map((s) => {
                  const statusClass =
                    STATUS_COLORS[s.status] ??
                    "bg-gray-100 text-gray-600 border-gray-200"
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--color-pmb-green-900)]">
                          {s.nome}
                        </div>
                        {s.cpf && (
                          <div className="text-[11px] text-gray-500">
                            CPF: {s.cpf}
                          </div>
                        )}
                        {s.eaAlunoId && (
                          <div className="text-[10px] text-gray-400">
                            ID plataforma: {s.eaAlunoId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.tenant.isPmbDirect ? (
                          <span className="inline-block rounded-full bg-[var(--color-pmb-lime-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-pmb-green-900)]">
                            Vitrine PMB
                          </span>
                        ) : (
                          <div>
                            <div className="text-xs font-semibold text-[var(--color-pmb-green-900)]">
                              {s.tenant.name}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {vitrineHost(s.tenant.slug)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{s.email ?? "—"}</div>
                        {s.fone && (
                          <div className="text-gray-500">{s.fone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-[var(--color-pmb-green-900)]">
                        {s.activeEnrollments}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass}`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-black ${
          accent ?? "text-[var(--color-pmb-green-900)]"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
