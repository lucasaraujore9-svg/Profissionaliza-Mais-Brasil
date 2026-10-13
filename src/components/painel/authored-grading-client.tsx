"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LmsPendingAttempt } from "@/lib/lms/grading"

const ALL = "__all__"

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Fila de correção das dissertativas. A nota final mostrada enquanto a pessoa
 * corrige usa a MESMA conta do LMS (objetivas + pontos dados) / total; quem
 * grava e decide é o LMS, e a resposta dele é o que vai no aviso.
 */
export function AuthoredGradingClient({ canManage }: { canManage: boolean }) {
  const [attempts, setAttempts] = useState<LmsPendingAttempt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [course, setCourse] = useState(ALL)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/painel/cursos-autorais/correcoes", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Não foi possível carregar as provas.")
      setAttempts(json.data.attempts)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar as provas.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const courses = useMemo(() => {
    const map = new Map<string, { title: string; count: number }>()
    for (const a of attempts ?? []) {
      const c = map.get(a.course.id) ?? { title: a.course.title, count: 0 }
      c.count++
      map.set(a.course.id, c)
    }
    return [...map.entries()].sort((x, y) => x[1].title.localeCompare(y[1].title))
  }, [attempts])

  const visible = (attempts ?? []).filter((a) => course === ALL || a.course.id === course)

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6 text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Tentar de novo
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!attempts) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando provas…
      </div>
    )
  }

  if (attempts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="size-10 text-[var(--color-pmb-green,#025918)]" />
          <p className="font-medium">Nada para corrigir</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Quando um aluno responder uma questão dissertativa de um curso seu, a
            resposta aparece aqui para você dar a nota.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {attempts.length === 1 ? "1 prova aguardando nota" : `${attempts.length} provas aguardando nota`}
          {attempts.length >= 100 && " (mostrando as 100 mais antigas)"}
        </p>
        <div className="flex items-center gap-2">
          {courses.length > 1 && (
            <Select value={course} onValueChange={(v) => typeof v === "string" && setCourse(v)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os cursos</SelectItem>
                {courses.map(([id, c]) => (
                  <SelectItem key={id} value={id}>
                    {c.title} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
      </div>

      {visible.map((a) => (
        <AttemptCard
          key={a.id}
          attempt={a}
          canManage={canManage}
          onDone={(id) => setAttempts((list) => (list ?? []).filter((x) => x.id !== id))}
        />
      ))}
    </div>
  )
}

function AttemptCard({
  attempt,
  canManage,
  onDone,
}: {
  attempt: LmsPendingAttempt
  canManage: boolean
  onDone: (attemptId: string) => void
}) {
  // Nota em branco = ainda não corrigida. Não começa em 0 de propósito: salvar
  // sem olhar daria zero ao aluno em silêncio.
  const [awards, setAwards] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const parsed = attempt.essays.map((e) => {
    const raw = awards[e.id]
    const n = raw === undefined || raw.trim() === "" ? null : Number(raw)
    const valid = n !== null && Number.isInteger(n) && n >= 0 && n <= e.maxPoints
    return { essay: e, value: valid ? n : null, invalid: n !== null && !valid }
  })
  const complete = parsed.every((p) => p.value !== null)
  const earned = attempt.earnedPoints + parsed.reduce((s, p) => s + (p.value ?? 0), 0)
  const score = Math.round((earned / attempt.totalPoints) * 100)
  const passed = score >= attempt.quiz.minScore

  async function save() {
    if (!complete) return
    setSaving(true)
    try {
      const res = await fetch(`/api/painel/cursos-autorais/correcoes/${encodeURIComponent(attempt.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awards: Object.fromEntries(parsed.map((p) => [p.essay.id, p.value])),
        }),
      })
      const json = await res.json()
      if (res.status === 409) {
        // Outra pessoa corrigiu antes: some da fila, não há o que refazer aqui.
        toast.info(json.error ?? "Esta prova já foi corrigida.")
        onDone(attempt.id)
        return
      }
      if (!res.ok) throw new Error(json.error ?? "Não foi possível salvar a correção.")
      toast.success(
        `${attempt.studentName}: ${json.data.score}% — ${json.data.passed ? "aprovado" : "não atingiu a nota mínima"}`,
      )
      onDone(attempt.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a correção.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="font-semibold">{attempt.studentName}</p>
            <p className="text-sm text-muted-foreground">
              {attempt.course.title} · {attempt.quiz.title}
              {attempt.quiz.placement && ` (${attempt.quiz.placement})`}
            </p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            Enviada em {dateFmt.format(new Date(attempt.attemptedAt))}
          </span>
        </div>

        {parsed.map(({ essay, invalid }, i) => (
          <div key={essay.id} className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">
              {attempt.essays.length > 1 && `${i + 1}. `}
              {essay.statement}
            </p>
            <div className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2.5 text-sm">
              {essay.text.trim() || <span className="text-muted-foreground">(resposta em branco)</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`award-${essay.id}`}>Nota</label>
              <Input
                id={`award-${essay.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={essay.maxPoints}
                step={1}
                className="w-20"
                disabled={!canManage || saving}
                aria-invalid={invalid}
                value={awards[essay.id] ?? ""}
                onChange={(ev) => setAwards((s) => ({ ...s, [essay.id]: ev.target.value }))}
              />
              <span className="text-muted-foreground">de {essay.maxPoints}</span>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => setAwards((s) => ({ ...s, [essay.id]: "0" }))}
                  >
                    Zerar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => setAwards((s) => ({ ...s, [essay.id]: String(essay.maxPoints) }))}
                  >
                    Nota máxima
                  </Button>
                </div>
              )}
              {invalid && (
                <span className="text-destructive">Use um número inteiro de 0 a {essay.maxPoints}.</span>
              )}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-sm">
            {complete ? (
              <>
                <span>
                  Nota final: <strong className="tabular-nums">{score}%</strong>
                </span>
                <Badge variant={passed ? "default" : "destructive"}>
                  {passed ? "Aprovado" : `Abaixo de ${attempt.quiz.minScore}%`}
                </Badge>
              </>
            ) : (
              <span className="text-muted-foreground">
                Dê a nota de {attempt.essays.length > 1 ? "todas as respostas" : "a resposta"} para ver a nota final.
              </span>
            )}
          </div>
          {canManage && (
            <Button onClick={() => void save()} disabled={!complete || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
              Salvar correção
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
