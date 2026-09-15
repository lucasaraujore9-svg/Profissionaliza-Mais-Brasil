"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PlayCircle, RotateCcw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SubscriptionSlots } from "@/lib/subscriptions/slots"

/**
 * "Começar" (ou "Retomar") um curso do plano assinado.
 *
 * A matrícula não existe antes deste clique — o provisionamento é sob demanda.
 * Por isso o botão trava enquanto provisiona (fala com a fornecedora) e trata
 * 409 BUSY como "espere e recarregue", não como erro: significa que outra
 * alteração da lista está em andamento (duplo clique).
 *
 * Com a lista cheia (409 SLOTS_FULL) abre o seletor de troca: o aluno escolhe
 * qual curso sai para este entrar. O seletor só oferece curso que pode sair
 * sem perder nada — o que guarda progresso, ou o que ele nem começou.
 */
export function StartCourseButton({
  courseId,
  courseName,
  resume = false,
  progressPercent = 0,
}: {
  courseId: string
  courseName: string
  /** O aluno já teve este curso e o tirou da lista. */
  resume?: boolean
  progressPercent?: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slots, setSlots] = useState<SubscriptionSlots | null>(null)
  const [replaceId, setReplaceId] = useState<string | null>(null)

  async function start(substituirCursoId?: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/aluno/assinatura/curso/${courseId}/liberar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(substituirCursoId ? { substituirCursoId } : {}),
        },
      )
      const body = await res.json().catch(() => ({}))

      if (res.status === 409 && body.code === "SLOTS_FULL" && body.slots) {
        setSlots(body.slots as SubscriptionSlots)
        setReplaceId(null)
        return
      }
      // O curso escolhido não pôde sair (o aluno já o começou e a conferência ao
      // vivo pegou o que a lista local ainda não sabia). A resposta traz a lista
      // atualizada: sem ela o seletor seguiria oferecendo a mesma opção.
      if (res.status === 422 && body.code === "SLOT_NOT_RELEASABLE" && body.slots) {
        setSlots(body.slots as SubscriptionSlots)
        setReplaceId(null)
        setError(body.error ?? "Esse curso não pode sair da sua lista")
        return
      }
      if (res.status === 409) {
        // Já está sendo liberado agora: recarregar mostra o card pronto.
        setSlots(null)
        router.refresh()
        return
      }
      if (!res.ok) {
        setError(body.error ?? "Não foi possível liberar o curso")
        return
      }
      setSlots(null)
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  const releasable = slots?.courses.filter((c) => c.releasable) ?? []
  const lockedCount = (slots?.courses.length ?? 0) - releasable.length

  return (
    <div>
      <button
        type="button"
        onClick={() => start()}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
      >
        {loading && !slots ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Liberando…
          </>
        ) : resume ? (
          <>
            <RotateCcw className="h-3.5 w-3.5" />
            Retomar{progressPercent > 0 ? ` (${progressPercent}%)` : ""}
          </>
        ) : (
          <>
            <PlayCircle className="h-3.5 w-3.5" />
            Começar
          </>
        )}
      </button>
      {error && !slots && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600">
          {error}
        </p>
      )}

      <Dialog
        open={slots !== null}
        onOpenChange={(open) => {
          // Fechar no meio da troca não cancela o pedido já enviado — só
          // esconderia o resultado. Enquanto carrega, o diálogo fica.
          if (!open && !loading) setSlots(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sua lista de cursos está cheia</DialogTitle>
            <DialogDescription>
              Você pode ter até {slots?.max} cursos em andamento. Para abrir{" "}
              <strong>{courseName}</strong>, escolha qual curso sai da lista.
              Nada se perde: é só retomar quando quiser.
            </DialogDescription>
          </DialogHeader>

          {releasable.length === 0 ? (
            <p className="text-xs text-gray-600">
              Nenhum dos seus cursos atuais pode sair da lista agora. Conclua um
              deles para liberar uma vaga.
            </p>
          ) : (
            <fieldset className="max-h-72 space-y-1.5 overflow-y-auto">
              <legend className="sr-only">Curso que sai da lista</legend>
              {releasable.map((c) => (
                <label
                  key={c.courseId}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-xs has-[:checked]:border-[var(--color-pmb-green)] has-[:checked]:bg-[var(--color-pmb-green)]/5"
                >
                  <input
                    type="radio"
                    name={`replace-${courseId}`}
                    value={c.courseId}
                    checked={replaceId === c.courseId}
                    onChange={() => setReplaceId(c.courseId)}
                    disabled={loading}
                  />
                  <span className="flex-1 font-medium text-gray-800">{c.nome}</span>
                  <span className="shrink-0 text-gray-500">
                    {c.keepsProgress ? `${c.progressPercent}%` : "não iniciado"}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {releasable.length > 0 && lockedCount > 0 && (
            <p className="text-[11px] text-gray-500">
              {lockedCount === 1
                ? "1 curso que você já começou não aparece aqui: ele libera a vaga quando você concluir."
                : `${lockedCount} cursos que você já começou não aparecem aqui: eles liberam a vaga quando você concluir.`}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setSlots(null)}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
            >
              Voltar
            </button>
            {releasable.length > 0 && (
              <button
                type="button"
                onClick={() => replaceId && start(replaceId)}
                disabled={loading || !replaceId}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Trocar e abrir o curso
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
