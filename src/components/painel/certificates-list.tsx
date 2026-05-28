"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Eye, Loader2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface CertificateRow {
  id: string
  code: string
  studentName: string
  courseName: string
  completionDate: string
  pdfUrl: string | null
  revokedAt: string | null
  revokedReason: string | null
  source: "AUTO" | "MANUAL_ADMIN" | "MANUAL_RESELLER"
  createdAt: string
  tenantId?: string | null
  tenantName?: string
  tenantSlug?: string | null
}

export interface TenantOption {
  id: string | "pmb" | "any"
  label: string
}

interface Props {
  listEndpoint: string
  /**
   * Template de URL para revogacao. Use `{id}` como placeholder.
   * Ex: "/api/admin/certificates/{id}/revoke"
   *
   * (Server Components nao podem passar funcoes para Client Components,
   * por isso usamos string template aqui.)
   */
  revokeEndpoint: string
  /**
   * Se passado, mostra dropdown de tenants (uso admin).
   */
  tenantOptions?: TenantOption[]
  showTenantColumn?: boolean
}

const SOURCE_LABELS: Record<CertificateRow["source"], string> = {
  AUTO: "Automático",
  MANUAL_ADMIN: "Admin",
  MANUAL_RESELLER: "Revendedor",
}

export function CertificatesList({
  listEndpoint,
  revokeEndpoint,
  tenantOptions,
  showTenantColumn,
}: Props) {
  const [rows, setRows] = useState<CertificateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"all" | "issued" | "revoked">("all")
  const [tenantFilter, setTenantFilter] = useState<string>("any")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [revoking, setRevoking] = useState<CertificateRow | null>(null)
  const [revokeReason, setRevokeReason] = useState("")
  const [revokeSubmitting, setRevokeSubmitting] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    if (q) sp.set("q", q)
    if (status !== "all") sp.set("status", status)
    if (tenantOptions && tenantFilter && tenantFilter !== "any") {
      sp.set("tenantId", tenantFilter)
    }
    if (from) sp.set("from", from)
    if (to) sp.set("to", to)
    return sp.toString()
  }, [q, status, tenantFilter, from, to, tenantOptions])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = queryString ? `${listEndpoint}?${queryString}` : listEndpoint
      const res = await fetch(url, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar certificados")
        setRows([])
        return
      }
      setRows(body.data as CertificateRow[])
    } catch {
      setError("Erro de rede")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [listEndpoint, queryString])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 250)
    return () => clearTimeout(t)
  }, [load])

  async function handleConfirmRevoke() {
    if (!revoking) return
    setRevokeSubmitting(true)
    setRevokeError(null)
    try {
      const res = await fetch(revokeEndpoint.replace("{id}", revoking.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revokeReason.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRevokeError(body.error ?? "Falha ao revogar")
        return
      }
      setRevoking(null)
      setRevokeReason("")
      await load()
    } catch {
      setRevokeError("Erro de rede")
    } finally {
      setRevokeSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.4fr_repeat(4,_1fr)]">
          <div>
            <Label htmlFor="cert-q">Buscar</Label>
            <Input
              id="cert-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Aluno, curso ou código"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cert-status">Status</Label>
            <select
              id="cert-status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "all" | "issued" | "revoked")
              }
              className="mt-1.5 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="all">Todos</option>
              <option value="issued">Emitidos</option>
              <option value="revoked">Revogados</option>
            </select>
          </div>
          {tenantOptions && (
            <div>
              <Label htmlFor="cert-tenant">Tenant</Label>
              <select
                id="cert-tenant"
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                {tenantOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="cert-from">De</Label>
            <Input
              id="cert-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cert-to">Até</Label>
            <Input
              id="cert-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Aluno</Th>
              <Th>Curso</Th>
              {showTenantColumn && <Th>Tenant</Th>}
              <Th>Código</Th>
              <Th>Emissão</Th>
              <Th>Origem</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td
                  colSpan={showTenantColumn ? 8 : 7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showTenantColumn ? 8 : 7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  Nenhum certificado encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const revoked = !!row.revokedAt
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-[var(--color-pmb-green-900)]">
                        {row.studentName}
                      </div>
                    </Td>
                    <Td>{row.courseName}</Td>
                    {showTenantColumn && (
                      <Td>
                        <span className="text-xs text-gray-600">
                          {row.tenantName ?? "—"}
                        </span>
                      </Td>
                    )}
                    <Td>
                      <span className="font-mono text-xs">{row.code}</span>
                    </Td>
                    <Td>
                      {new Date(row.createdAt).toLocaleDateString("pt-BR")}
                    </Td>
                    <Td>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                        {SOURCE_LABELS[row.source]}
                      </span>
                    </Td>
                    <Td>
                      {revoked ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          Revogado
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Emitido
                        </span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/validar/${row.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Visualizar página pública"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                        {row.pdfUrl && (
                          <a
                            href={revokeEndpoint
                              .replace("/revoke", "/download")
                              .replace("{id}", row.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            title="Baixar PDF"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {!revoked && (
                          <button
                            type="button"
                            onClick={() => {
                              setRevoking(row)
                              setRevokeReason("")
                              setRevokeError(null)
                            }}
                            title="Revogar"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {revoking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
              Revogar certificado
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              O certificado <span className="font-mono">{revoking.code}</span> de{" "}
              <strong>{revoking.studentName}</strong> deixará de ser válido
              imediatamente.
            </p>

            <div className="mt-4">
              <Label htmlFor="revoke-reason">Motivo da revogação</Label>
              <Input
                id="revoke-reason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Ex: emitido por engano"
                className="mt-1.5"
                maxLength={500}
              />
            </div>

            {revokeError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {revokeError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRevoking(null)
                  setRevokeReason("")
                  setRevokeError(null)
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={
                  revokeSubmitting || revokeReason.trim().length < 3
                }
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revokeSubmitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Confirmar revogação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 ${className ?? ""}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>
}
