"use client"

import { useCallback, useEffect, useState } from "react"
import { History, Loader2, RefreshCw } from "lucide-react"

type Direcao = "saida" | "entrada"
type Status = "todos" | "ok" | "erro" | "fila"

interface Item {
  id: string
  quando: string
  evento: string
  situacao: "ok" | "erro" | "fila"
  destino: string
  detalhe: string
  payload: unknown
}

const SITUACAO = {
  ok: { label: "Sucesso", cls: "bg-emerald-50 text-emerald-700" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700" },
  fila: { label: "Na fila", cls: "bg-amber-50 text-amber-700" },
} as const

const selectCls =
  "h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700"

function formatarData(valor: string): string {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Log dos webhooks nos dois sentidos: o que o PMB enviou aos sistemas
 * integrados e o que recebeu (LMS, Asaas, Mercado Pago), com sucesso ou erro.
 */
export function WebhookLogPanel() {
  const [direcao, setDirecao] = useState<Direcao>("saida")
  const [status, setStatus] = useState<Status>("todos")
  const [origem, setOrigem] = useState("")
  const [itens, setItens] = useState<Item[]>([])
  const [proximo, setProximo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(
    async (antes?: string) => {
      setCarregando(true)
      setErro(null)
      const qs = new URLSearchParams({ direcao, status })
      if (direcao === "entrada" && origem) qs.set("origem", origem)
      if (antes) qs.set("antes", antes)
      try {
        const res = await fetch(`/api/admin/webhooks/log?${qs}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar o log.")
        setItens((prev) => (antes ? [...prev, ...body.data.itens] : body.data.itens))
        setProximo(body.data.proximo)
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar o log.")
      } finally {
        setCarregando(false)
      }
    },
    [direcao, status, origem],
  )

  useEffect(() => {
    void buscar()
  }, [buscar])

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Log de webhooks
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={carregando}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Cada disparo, com o resultado. <strong>Enviados</strong>: o que o PMB
        mandou para os sistemas cadastrados acima. <strong>Recebidos</strong>: o
        que chegou do LMS, do Asaas e do Mercado Pago.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          aria-label="Sentido"
          value={direcao}
          onChange={(e) => {
            setDirecao(e.target.value as Direcao)
            setStatus("todos")
          }}
          className={selectCls}
        >
          <option value="saida">Enviados pelo PMB</option>
          <option value="entrada">Recebidos pelo PMB</option>
        </select>
        <select
          aria-label="Resultado"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className={selectCls}
        >
          <option value="todos">Todos</option>
          <option value="ok">Sucesso</option>
          <option value="erro">Erro</option>
          {direcao === "saida" && <option value="fila">Na fila</option>}
        </select>
        {direcao === "entrada" && (
          <select
            aria-label="Origem"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className={selectCls}
          >
            <option value="">Todas as origens</option>
            <option value="LMS">LMS</option>
            <option value="ASAAS">Asaas</option>
            <option value="MERCADO_PAGO">Mercado Pago</option>
          </select>
        )}
      </div>

      {erro && (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {erro}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-400">
              <th className="pb-2 font-semibold">Quando</th>
              <th className="pb-2 font-semibold">Evento</th>
              <th className="pb-2 font-semibold">Resultado</th>
              <th className="pb-2 font-semibold">{direcao === "saida" ? "Destino" : "Origem"}</th>
              <th className="pb-2 font-semibold">Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((item) => {
              const st = SITUACAO[item.situacao]
              return (
                <tr key={item.id} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-3">{formatarData(item.quando)}</td>
                  <td className="py-2 pr-3">
                    <code className="font-mono text-[11px]">{item.evento}</code>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-gray-400">payload</summary>
                      <pre className="mt-1 max-h-60 max-w-md overflow-auto rounded bg-gray-900 p-2 text-[10px] text-gray-100">
                        {JSON.stringify(item.payload, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="max-w-[14rem] break-words py-2 pr-3 text-gray-600">{item.destino}</td>
                  <td className="max-w-[20rem] break-words py-2 text-gray-600">{item.detalhe || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!carregando && itens.length === 0 && (
          <p className="py-6 text-center text-xs text-gray-400">Nenhum disparo com esse filtro.</p>
        )}
      </div>

      {proximo && (
        <button
          type="button"
          onClick={() => void buscar(proximo)}
          disabled={carregando}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          {carregando && <Loader2 className="h-3 w-3 animate-spin" />}
          Carregar mais
        </button>
      )}
    </section>
  )
}
