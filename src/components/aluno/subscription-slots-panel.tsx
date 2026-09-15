"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import type { SubscriptionSlots } from "@/lib/subscriptions/slots"

/**
 * "X de 10 cursos em andamento", com a saída de cada um.
 *
 * Tirar da lista NÃO é desistir do curso quando ele guarda o progresso: o card
 * do catálogo passa a oferecer "Retomar". O texto diz isso antes de confirmar,
 * porque "remover" lido sozinho soa como perder o que já foi estudado. Os
 * cursos que NÃO guardam progresso fora da lista só saem antes de o aluno
 * começar — e a tela diz por que o botão sumiu, em vez de só sumir.
 *
 * Sem nomear a fornecedora: para o aluno é tudo "a plataforma de aulas".
 */
export function SubscriptionSlotsPanel({ slots }: { slots: SubscriptionSlots }) {
  const full = slots.used >= slots.max
  const hasLocked = slots.courses.some((c) => !c.releasable)

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Seus cursos em andamento
        </h2>
        <p className={`text-xs font-semibold ${full ? "text-amber-700" : "text-gray-600"}`}>
          {slots.used} de {slots.max}
        </p>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Você estuda até {slots.max} cursos ao mesmo tempo. Cursos concluídos não
        contam. Para abrir outro com a lista cheia, tire um da lista.
        {hasLocked &&
          " Alguns cursos só saem da lista antes de você começar: depois disso, a vaga libera quando você concluir."}
      </p>

      {slots.courses.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100">
          {slots.courses.map((c) => (
            <SlotRow key={c.courseId} course={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SlotRow({ course }: { course: SubscriptionSlots["courses"][number] }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/aluno/assinatura/curso/${course.courseId}/remover`,
        { method: "POST" },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 409) {
        setError(body.error ?? "Não foi possível tirar o curso da lista")
        // 422: a conferência ao vivo viu que o aluno já começou e gravou o
        // progresso. Recarregar troca o botão por "Libera ao concluir".
        if (res.status === 422) router.refresh()
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800">
          {course.nome}
        </span>
        <span className="shrink-0 text-[11px] text-gray-500">
          {course.progressPercent}%
        </span>
        {course.releasable && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-[11px] font-medium text-gray-500 underline hover:text-gray-700"
          >
            Tirar da lista
          </button>
        )}
        {!course.releasable && (
          <span className="shrink-0 text-[11px] text-gray-400">
            Libera ao concluir
          </span>
        )}
      </div>

      {confirming && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-700">
            {course.keepsProgress ? (
              <>
                Tirar <strong>{course.nome}</strong> da lista? Ele sai dos seus
                cursos em andamento, mas o progresso fica salvo. Para voltar, é só
                retomar no catálogo do plano.
              </>
            ) : (
              <>
                Tirar <strong>{course.nome}</strong> da lista? Você ainda não
                começou este curso, então nada se perde. Para abrir de novo, é só
                procurar no catálogo do plano.
              </>
            )}
          </p>
          {error && (
            <p role="alert" className="mt-1.5 text-[11px] text-red-600">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {course.releasable && (
              <button
                type="button"
                onClick={remove}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                Tirar da lista
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-700"
            >
              Manter
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
