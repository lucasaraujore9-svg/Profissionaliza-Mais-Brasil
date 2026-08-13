"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, FileWarning, Loader2 } from "lucide-react"
import { TitularityForm } from "./titularity-form"
// Importado, e não redeclarado: o `Record<TitularitySignal, string>` da origem
// garante exaustividade — um sinal novo quebra o build lá, em vez de renderizar
// `undefined` aqui.
import {
  SIGNAL_LABEL,
  type TitularityCandidate,
} from "@/lib/students/titularity/types"

/**
 * Fila de revisão de titularidade.
 *
 * Endpoints entram por PROP em template string porque um Server Component não
 * passa função para Client Component — mesmo padrão de `certificates-list.tsx`.
 */
export function TitularityReviewQueue({
  listEndpoint,
  applyEndpoint,
  showTenant = false,
}: {
  listEndpoint: string
  /** Ex.: `/api/painel/alunos/:id/titularidade` — `:id` é substituído. */
  applyEndpoint: string
  showTenant?: boolean
}) {
  const [candidates, setCandidates] = useState<TitularityCandidate[] | null>(
    null,
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [dismissing, setDismissing] = useState<string | null>(null)

  /**
   * "Conferi e está correto". A maioria dos 17 alunos com certificado tem o
   * cadastro certo — sem esta saída, a única forma de limpar a fila seria
   * submeter uma correção falsa.
   */
  async function dismiss(id: string) {
    setDismissing(id)
    try {
      await fetch(applyEndpoint.replace(":id", id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: "" }),
      })
      await load()
    } finally {
      setDismissing(null)
    }
  }

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const res = await fetch(
        `${listEndpoint}${includeReviewed ? "?revisados=1" : ""}`,
      )
      const body = await res.json().catch(() => ({}))
      // `isCurrent` evita que uma resposta antiga (troca rápida do filtro)
      // sobrescreva a nova. O setState não é síncrono no corpo do efeito — vem
      // depois do await.
      if (isCurrent()) setCandidates(body.data?.candidates ?? [])
    },
    [listEndpoint, includeReviewed],
  )

  useEffect(() => {
    let ignore = false
    void load(() => !ignore)
    return () => {
      ignore = true
    }
  }, [load])

  if (candidates === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analisando cadastros…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Esta lista mostra <strong>suspeitas</strong>, não erros confirmados. O
          nome de uma mãe é um nome de aluno perfeitamente válido — não existe
          como o sistema saber sozinho. Confira o documento do aluno antes de
          corrigir; nada aqui é alterado automaticamente.
        </p>
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(e) => setIncludeReviewed(e.target.checked)}
          />
          Mostrar também os já revisados
        </label>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          <Check className="mb-2 h-5 w-5" />
          Nenhum cadastro pendente de revisão.
        </div>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--color-pmb-green-900)]">
                    {c.nome}
                    {c.revisadaEm && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        revisado
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {c.email ?? "sem e-mail"}
                    {c.cpf ? ` · CPF ${c.cpf}` : " · sem CPF"}
                    {c.nascimento
                      ? ` · nasc. ${c.nascimento.split("-").reverse().join("/")}`
                      : " · sem data de nascimento"}
                    {showTenant && c.tenantName ? ` · ${c.tenantName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {c.enrollmentsCount} matrícula(s)
                    {c.certificatesCount > 0 && (
                      <span className="ml-1 font-medium text-amber-700">
                        · {c.certificatesCount} certificado(s) emitido(s)
                      </span>
                    )}
                    {c.responsavel ? ` · resp. ${c.responsavel}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.signals.map((sig) => (
                      <span
                        key={sig}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200"
                      >
                        {sig === "CERTIFICADO_EMITIDO" ? (
                          <FileWarning className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {SIGNAL_LABEL[sig]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!c.revisadaEm && (
                    <button
                      type="button"
                      disabled={dismissing === c.id}
                      onClick={() => void dismiss(c.id)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      title="Conferi e o cadastro está correto — tirar da fila"
                    >
                      {dismissing === c.id ? "Salvando…" : "Está correto"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === c.id ? null : c.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {openId === c.id ? "Fechar" : "Corrigir"}
                  </button>
                </div>
              </div>

              {openId === c.id && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <TitularityForm
                    candidate={c}
                    endpoint={applyEndpoint.replace(":id", c.id)}
                    onDone={() => {
                      setOpenId(null)
                      void load()
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
