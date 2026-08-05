"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCan } from "@/components/shared/permissions/permission-context"
import { API_SCOPE_LABELS, API_SCOPES, type ApiScope } from "@/lib/api-parceiros/scopes"

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  status: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  usageCount: number
  createdAt: string
  createdBy: { id: string; name: string } | null
}

function formatarData(valor: string | null): string {
  if (!valor) return "—"
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Gestão das chaves da API de parceiros.
 *
 * O segredo aparece UMA vez, no retorno da criação — o banco só guarda o hash.
 * O painel deixa isso explícito em vez de sugerir que dá para consultar depois:
 * a alternativa (guardar o segredo para reexibir) é exatamente o que torna um
 * vazamento do banco equivalente a um vazamento de todas as integrações.
 */
export function ApiKeysManager() {
  const podeGerenciar = useCan("integracoes.manage")

  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState("")
  const [escopos, setEscopos] = useState<ApiScope[]>([...API_SCOPES])
  const [segredoNovo, setSegredoNovo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch("/api/admin/api-keys")
      const body = await res.json()
      if (!res.ok) {
        setErro(body.error ?? "Falha ao carregar as chaves.")
        return
      }
      setKeys(body.data.keys)
    } catch {
      setErro("Falha de rede ao carregar as chaves.")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function criar() {
    if (!nome.trim() || escopos.length === 0) return
    setCriando(true)
    setErro(null)
    setSegredoNovo(null)
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim(), scopes: escopos }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErro(body.error ?? "Falha ao criar a chave.")
        return
      }
      setSegredoNovo(body.data.secret)
      setNome("")
      await carregar()
    } catch {
      setErro("Falha de rede ao criar a chave.")
    } finally {
      setCriando(false)
    }
  }

  async function revogar(id: string, nomeChave: string) {
    // `confirm` nativo: revogar derruba a integração do parceiro na hora.
    if (
      !window.confirm(
        `Revogar a chave "${nomeChave}"? O sistema que a usa perde o acesso imediatamente. Não há como reativar.`,
      )
    ) {
      return
    }
    setErro(null)
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoke: true }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErro(body.error ?? "Falha ao revogar a chave.")
        return
      }
      await carregar()
    } catch {
      setErro("Falha de rede ao revogar a chave.")
    }
  }

  async function copiarSegredo() {
    if (!segredoNovo) return
    try {
      await navigator.clipboard.writeText(segredoNovo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Chaves de acesso dos parceiros
        </h3>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Uma chave por sistema integrado. Revogar uma não afeta as demais. O valor
        completo aparece <strong>uma única vez</strong>, no momento da criação.
      </p>

      {erro && (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {erro}
        </div>
      )}

      {/* Segredo recém-criado */}
      {segredoNovo && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">
              Copie agora — esta chave não será exibida de novo.
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 ring-1 ring-amber-200">
            <span className="flex-1 break-all font-mono text-xs font-semibold text-gray-800">
              {segredoNovo}
            </span>
            <button
              type="button"
              onClick={copiarSegredo}
              aria-label="Copiar chave"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100"
            >
              {copiado ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Criação */}
      {podeGerenciar && (
        <div className="mt-5 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Nova chave
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="api-key-name" className="text-xs">
                Nome do sistema integrado
              </Label>
              <Input
                id="api-key-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: CRM da rede, ERP do contador"
                maxLength={80}
                className="mt-1"
              />
            </div>
            <button
              type="button"
              onClick={criar}
              disabled={criando || nome.trim().length < 2 || escopos.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {criando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Gerar chave
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Escopos
            </p>
            {API_SCOPES.map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-2 text-xs text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={escopos.includes(scope)}
                  onChange={(e) =>
                    setEscopos((prev) =>
                      e.target.checked
                        ? [...prev, scope]
                        : prev.filter((s) => s !== scope),
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <code className="font-mono text-[11px] text-gray-500">{scope}</code>
                <span>{API_SCOPE_LABELS[scope]}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Listagem */}
      <div className="mt-5">
        {carregando ? (
          <p className="py-6 text-center text-xs text-gray-400">Carregando…</p>
        ) : keys.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 ring-1 ring-gray-200">
            Nenhuma chave criada ainda. Enquanto não houver chave ativa, a API de
            parceiros responde 401 para todo mundo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2 font-semibold">Sistema</th>
                  <th className="pb-2 font-semibold">Chave</th>
                  <th className="pb-2 font-semibold">Escopos</th>
                  <th className="pb-2 font-semibold">Último uso</th>
                  <th className="pb-2 font-semibold">Chamadas</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map((key) => {
                  const ativa = key.status === "ACTIVE"
                  return (
                    <tr key={key.id} className={ativa ? "" : "text-gray-400"}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-gray-800">{key.name}</p>
                        <p className="text-[11px] text-gray-400">
                          criada em {formatarData(key.createdAt)}
                          {key.createdBy ? ` por ${key.createdBy.name}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <code className="font-mono text-[11px]">{key.prefix}…</code>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-mono text-[11px]">
                          {key.scopes.join(", ") || "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-3">{formatarData(key.lastUsedAt)}</td>
                      <td className="py-3 pr-3">{key.usageCount}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            ativa
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {ativa ? "Ativa" : "Revogada"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {podeGerenciar && ativa && (
                          <button
                            type="button"
                            onClick={() => revogar(key.id, key.name)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            <Ban className="h-3 w-3" />
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
