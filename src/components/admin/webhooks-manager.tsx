"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCan } from "@/components/shared/permissions/permission-context"
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type WebhookEvent,
} from "@/lib/webhooks-saida/core"

interface EndpointRow {
  id: string
  name: string
  url: string
  events: string[]
  status: string
  createdAt: string
  createdBy: { id: string; name: string } | null
  entregas: Partial<Record<"PENDING" | "DELIVERED" | "FAILED", number>>
}

interface EntregaRow {
  id: string
  event: string
  status: string
  attempts: number
  nextAttemptAt: string
  lastStatusCode: number | null
  lastError: string | null
  deliveredAt: string | null
  createdAt: string
  payload: unknown
}

const STATUS_ENTREGA: Record<string, { label: string; cls: string }> = {
  DELIVERED: { label: "Entregue", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Na fila", cls: "bg-amber-50 text-amber-700" },
  FAILED: { label: "Falhou", cls: "bg-red-50 text-red-700" },
}

function formatarData(valor: string | null): string {
  if (!valor) return "—"
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const campos = body.fields ? Object.values(body.fields).flat().join(" ") : ""
    throw new Error([body.error ?? "Falha na requisição.", campos].filter(Boolean).join(" "))
  }
  return body.data
}

/**
 * Webhooks de SAÍDA: a URL do sistema integrado + os eventos que ele quer
 * receber. O segredo de assinatura aparece uma vez, na criação (ou ao trocar).
 */
export function WebhooksManager() {
  const podeGerenciar = useCan("integracoes.manage")

  const [endpoints, setEndpoints] = useState<EndpointRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Formulário (criação ou edição — `editandoId` decide).
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState("")
  const [url, setUrl] = useState("")
  const [eventos, setEventos] = useState<WebhookEvent[]>([])
  const [salvando, setSalvando] = useState(false)

  const [segredo, setSegredo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [entregas, setEntregas] = useState<EntregaRow[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await api("/api/admin/webhooks")
      setEndpoints(data.endpoints)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function carregarEntregas(id: string) {
    try {
      const data = await api(`/api/admin/webhooks/${id}/entregas`)
      setEntregas(data.entregas)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar entregas.")
    }
  }

  function limparForm() {
    setEditandoId(null)
    setNome("")
    setUrl("")
    setEventos([])
  }

  /** Executa uma ação, mostra erro/aviso e recarrega a lista. */
  async function executar(chave: string, fn: () => Promise<string | void>) {
    setOcupado(chave)
    setErro(null)
    setAviso(null)
    try {
      const msg = await fn()
      if (msg) setAviso(msg)
      await carregar()
      if (abertoId) await carregarEntregas(abertoId)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na operação.")
    } finally {
      setOcupado(null)
    }
  }

  async function salvar() {
    setSalvando(true)
    await executar("form", async () => {
      const body = JSON.stringify({ name: nome.trim(), url: url.trim(), events: eventos })
      if (editandoId) {
        await api(`/api/admin/webhooks/${editandoId}`, { method: "PATCH", body })
        limparForm()
        return "Webhook atualizado."
      }
      const data = await api("/api/admin/webhooks", { method: "POST", body })
      setSegredo(data.secret)
      limparForm()
    })
    setSalvando(false)
  }

  function editar(e: EndpointRow) {
    setEditandoId(e.id)
    setNome(e.name)
    setUrl(e.url)
    setEventos(e.events.filter((ev): ev is WebhookEvent =>
      (WEBHOOK_EVENTS as readonly string[]).includes(ev),
    ))
  }

  async function copiar() {
    if (!segredo) return
    try {
      await navigator.clipboard.writeText(segredo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }

  const formValido = nome.trim().length >= 2 && url.trim().startsWith("https://") && eventos.length > 0

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Webhooks de saída (PMB → seu sistema)
        </h3>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        O PMB faz um <code>POST</code> na URL cadastrada quando o evento escolhido
        acontece. Cada envio é assinado com HMAC-SHA256; falhas são reenviadas
        automaticamente por até ~1 dia e meio.
      </p>

      {erro && (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
          {aviso}
        </div>
      )}

      {segredo && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">
              Segredo de assinatura — copie agora, ele não será exibido de novo.
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 ring-1 ring-amber-200">
            <span className="flex-1 break-all font-mono text-xs font-semibold text-gray-800">
              {segredo}
            </span>
            <button
              type="button"
              onClick={copiar}
              aria-label="Copiar segredo"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100"
            >
              {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {podeGerenciar && (
        <div className="mt-5 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {editandoId ? "Editar webhook" : "Novo webhook"}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="wh-name" className="text-xs">Nome</Label>
              <Input
                id="wh-name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Automação n8n"
                maxLength={80}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="wh-url" className="text-xs">URL de destino (https)</Label>
              <Input
                id="wh-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://seu-sistema.com.br/webhooks/pmb"
                maxLength={500}
                inputMode="url"
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Eventos
            </p>
            <button
              type="button"
              onClick={() =>
                setEventos(eventos.length === WEBHOOK_EVENTS.length ? [] : [...WEBHOOK_EVENTS])
              }
              className="text-[11px] font-semibold text-[var(--color-pmb-green)] hover:underline"
            >
              {eventos.length === WEBHOOK_EVENTS.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={eventos.includes(ev)}
                  onChange={(e) =>
                    setEventos((prev) =>
                      e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev),
                    )
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                />
                <span>
                  <code className="block font-mono text-[11px] text-gray-500">{ev}</code>
                  {WEBHOOK_EVENT_LABELS[ev]}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !formValido}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : editandoId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editandoId ? "Salvar alterações" : "Cadastrar webhook"}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={limparForm}
                className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {carregando ? (
          <p className="py-6 text-center text-xs text-gray-400">Carregando…</p>
        ) : endpoints.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500 ring-1 ring-gray-200">
            Nenhum webhook cadastrado. Sem webhook, nenhum evento sai do PMB.
          </p>
        ) : (
          endpoints.map((e) => {
            const ativo = e.status === "ACTIVE"
            const aberto = abertoId === e.id
            return (
              <div key={e.id} className="rounded-xl ring-1 ring-gray-200">
                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{e.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          ativo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {ativo ? "Ativo" : "Desativado"}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-gray-500">{e.url}</p>
                    <p className="mt-1 font-mono text-[11px] text-gray-500">{e.events.join(", ")}</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {e.entregas.DELIVERED ?? 0} entregues · {e.entregas.PENDING ?? 0} na fila ·{" "}
                      {e.entregas.FAILED ?? 0} falharam
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <BotaoAcao
                      onClick={() => {
                        const novo = aberto ? null : e.id
                        setAbertoId(novo)
                        setEntregas([])
                        if (novo) void carregarEntregas(novo)
                      }}
                    >
                      {aberto ? "Ocultar entregas" : "Ver entregas"}
                    </BotaoAcao>
                    {podeGerenciar && (
                      <>
                        <BotaoAcao
                          disabled={!ativo || ocupado !== null}
                          onClick={() =>
                            executar(`teste-${e.id}`, async () => {
                              const data = await api(`/api/admin/webhooks/${e.id}/teste`, { method: "POST" })
                              const r = data.entrega
                              return r?.status === "DELIVERED"
                                ? `Teste entregue (HTTP ${r.lastStatusCode}).`
                                : `Teste não entregue: ${r?.lastError ?? "sem resposta"}. Ficou na fila para nova tentativa.`
                            })
                          }
                        >
                          {ocupado === `teste-${e.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Enviar teste
                        </BotaoAcao>
                        <BotaoAcao onClick={() => editar(e)}>
                          <Pencil className="h-3 w-3" />
                          Editar
                        </BotaoAcao>
                        <BotaoAcao
                          disabled={ocupado !== null}
                          onClick={() =>
                            executar(`status-${e.id}`, async () => {
                              await api(`/api/admin/webhooks/${e.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: ativo ? "DISABLED" : "ACTIVE" }),
                              })
                            })
                          }
                        >
                          {ativo ? "Desativar" : "Ativar"}
                        </BotaoAcao>
                        <BotaoAcao
                          disabled={ocupado !== null}
                          onClick={() => {
                            if (!window.confirm(`Trocar o segredo de "${e.name}"? O antigo para de valer na hora — atualize o sistema que recebe.`)) return
                            void executar(`segredo-${e.id}`, async () => {
                              const data = await api(`/api/admin/webhooks/${e.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ rotateSecret: true }),
                              })
                              setSegredo(data.secret)
                            })
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Trocar segredo
                        </BotaoAcao>
                        <BotaoAcao
                          perigo
                          disabled={ocupado !== null}
                          onClick={() => {
                            if (!window.confirm(`Excluir o webhook "${e.name}" e o histórico de entregas?`)) return
                            void executar(`del-${e.id}`, async () => {
                              await api(`/api/admin/webhooks/${e.id}`, { method: "DELETE" })
                              if (abertoId === e.id) setAbertoId(null)
                            })
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Excluir
                        </BotaoAcao>
                      </>
                    )}
                  </div>
                </div>

                {aberto && (
                  <div className="border-t border-gray-100 p-4">
                    {entregas.length === 0 ? (
                      <p className="text-xs text-gray-400">Nenhuma entrega ainda.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[40rem] text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-400">
                              <th className="pb-2 font-semibold">Quando</th>
                              <th className="pb-2 font-semibold">Evento</th>
                              <th className="pb-2 font-semibold">Status</th>
                              <th className="pb-2 font-semibold">Tentativas</th>
                              <th className="pb-2 font-semibold">Resposta</th>
                              <th className="pb-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entregas.map((d) => {
                              const st = STATUS_ENTREGA[d.status] ?? STATUS_ENTREGA.PENDING!
                              return (
                                <tr key={d.id} className="align-top">
                                  <td className="py-2 pr-3">{formatarData(d.createdAt)}</td>
                                  <td className="py-2 pr-3">
                                    <code className="font-mono text-[11px]">{d.event}</code>
                                    <details className="mt-1">
                                      <summary className="cursor-pointer text-[11px] text-gray-400">payload</summary>
                                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-gray-100">
                                        {JSON.stringify(d.payload, null, 2)}
                                      </pre>
                                    </details>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                                      {st.label}
                                    </span>
                                    {d.status === "PENDING" && d.attempts > 0 && (
                                      <p className="mt-1 text-[11px] text-gray-400">
                                        próxima: {formatarData(d.nextAttemptAt)}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3">{d.attempts}</td>
                                  <td className="py-2 pr-3">
                                    {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : "—"}
                                    {d.lastError && (
                                      <p className="max-w-[16rem] break-words text-[11px] text-red-600">{d.lastError}</p>
                                    )}
                                  </td>
                                  <td className="py-2 text-right">
                                    {podeGerenciar && d.status !== "PENDING" && (
                                      <BotaoAcao
                                        disabled={ocupado !== null}
                                        onClick={() =>
                                          executar(`re-${d.id}`, async () => {
                                            const data = await api(`/api/admin/webhooks/entregas/${d.id}/reenviar`, { method: "POST" })
                                            return data.entrega?.status === "DELIVERED"
                                              ? "Reenviado com sucesso."
                                              : `Reenvio falhou: ${data.entrega?.lastError ?? "sem resposta"}.`
                                          })
                                        }
                                      >
                                        Reenviar
                                      </BotaoAcao>
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
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function BotaoAcao({
  children,
  onClick,
  disabled,
  perigo,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        perigo ? "hover:border-red-300 hover:bg-red-50 hover:text-red-700" : "hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  )
}
