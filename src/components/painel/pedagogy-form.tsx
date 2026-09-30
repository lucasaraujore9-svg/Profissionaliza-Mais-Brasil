"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WriteGate } from "@/components/shared/permissions/permission-context"
import type { PedagogyInput } from "@/lib/pedagogia/schema"

const DIAS = [
  { v: 0, label: "Dom" },
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
]

const MODOS = [
  {
    v: "FREE" as const,
    titulo: "Livre",
    desc: "O aluno escolhe por onde começar e assiste na ordem que quiser.",
  },
  {
    v: "SEQUENTIAL" as const,
    titulo: "Sequencial",
    desc: "Cada aula só abre depois que a anterior é concluída.",
  },
  {
    v: "DRIP" as const,
    titulo: "Gotejamento",
    desc: "O conteúdo abre aos poucos, a partir da data da matrícula.",
  },
]

type CursoRegra = { courseId: string; nome: string; proprio: boolean }

/**
 * Formulario das regras de estudo. Serve a unidade (padrao) e UM curso
 * (`endpoint` = `/api/painel/cursos/:id/pedagogia`). `acoes` entra ao lado do
 * salvar — o "voltar as regras da unidade" do curso.
 */
export function PedagogyForm({
  inicial,
  alcance,
  endpoint = "/api/painel/pedagogia",
  acoes,
}: {
  inicial: PedagogyInput
  alcance: { proprios: number; parceira: number }
  endpoint?: string
  acoes?: React.ReactNode
}) {
  const router = useRouter()
  const [v, setV] = React.useState<PedagogyInput>(inicial)
  const [salvando, setSalvando] = React.useState(false)
  const set = <K extends keyof PedagogyInput>(k: K, val: PedagogyInput[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  async function salvar() {
    setSalvando(true)
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível salvar")
        return
      }
      // A regra vale de verdade quando chega na plataforma de aulas. Um "salvo!"
      // seco esconderia o caso em que ela ficou só no nosso banco — a unidade
      // acharia que configurou e o aluno não sentiria nada.
      if (json.propagado === false) {
        toast.warning(
          "Regras salvas, mas ainda não chegaram à plataforma de aulas. Elas serão reenviadas — se demorar, avise o suporte.",
        )
      } else {
        toast.success("Regras de estudo atualizadas")
      }
      router.refresh()
    } catch {
      toast.error("Falha de conexão ao salvar")
    } finally {
      setSalvando(false)
    }
  }

  const temHorario = Boolean(v.accessStart || v.accessEnd) || v.accessDays.length > 0

  return (
    <WriteGate perm="pedagogia.manage">
      <div className="space-y-6">
        {/* ── Ordem ───────────────────────────────────────────────── */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Ordem das aulas</h2>
            <p className="text-sm text-muted-foreground">Como o aluno avança pelo curso.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODOS.map((m) => (
              <label
                key={m.v}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  v.releaseMode === m.v
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-input hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="releaseMode"
                  className="sr-only"
                  checked={v.releaseMode === m.v}
                  onChange={() => set("releaseMode", m.v)}
                />
                <span className="block font-medium">{m.titulo}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{m.desc}</span>
              </label>
            ))}
          </div>

          {v.releaseMode === "DRIP" && (
            <div className="flex flex-wrap items-end gap-4 rounded-xl bg-muted/40 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="dripDays">Libera um novo</Label>
                <select
                  id="dripUnit"
                  className="h-10 w-40 rounded-md border border-input bg-background px-3 text-sm"
                  value={v.dripUnit}
                  onChange={(e) => set("dripUnit", e.target.value as PedagogyInput["dripUnit"])}
                >
                  <option value="MODULE">módulo</option>
                  <option value="LESSON">aula</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dripDays">a cada (dias)</Label>
                <Input
                  id="dripDays"
                  type="number"
                  min={1}
                  max={90}
                  className="w-28"
                  value={v.dripDays}
                  onChange={(e) => set("dripDays", Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <p className="flex-1 text-xs text-muted-foreground">
                O primeiro {v.dripUnit === "MODULE" ? "módulo" : "aula"} abre no dia da matrícula —
                quem compra hoje já tem o que assistir hoje.
              </p>
            </div>
          )}
        </Card>

        {/* ── Ritmo ───────────────────────────────────────────────── */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Ritmo diário</h2>
            <p className="text-sm text-muted-foreground">
              Quantas aulas o aluno pode concluir por dia. Rever aula já concluída nunca é
              bloqueado e não consome o limite.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dailyLessonLimit">Máximo de aulas por dia</Label>
              <Input
                id="dailyLessonLimit"
                type="number"
                min={1}
                max={100}
                placeholder="sem limite"
                className="w-40"
                value={v.dailyLessonLimit ?? ""}
                onChange={(e) =>
                  set("dailyLessonLimit", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quotaScope">Contando</Label>
              <select
                id="quotaScope"
                className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                disabled={v.dailyLessonLimit === null}
                value={v.quotaScope}
                onChange={(e) => set("quotaScope", e.target.value as PedagogyInput["quotaScope"])}
              >
                <option value="COURSE">por curso</option>
                <option value="STUDENT">somando todos os cursos do aluno</option>
              </select>
            </div>
          </div>
          {v.dailyLessonLimit !== null && (
            <p className="text-xs text-muted-foreground">
              {v.quotaScope === "COURSE"
                ? `Um aluno com 3 cursos poderá concluir ${v.dailyLessonLimit} aula(s) em cada um, por dia.`
                : `Um aluno com 3 cursos poderá concluir ${v.dailyLessonLimit} aula(s) no total, por dia.`}
            </p>
          )}
        </Card>

        {/* ── Horário ─────────────────────────────────────────────── */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Horário de estudo</h2>
            <p className="text-sm text-muted-foreground">
              Dias e horários em que o aluno pode acessar as aulas. Deixe em branco para liberar
              sempre.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => {
                // Nenhum dia marcado = TODOS os dias. É a mesma coisa para o
                // sistema e evita o estado "nenhum dia", que trancaria o aluno
                // para sempre.
                const ativo = v.accessDays.length === 0 || v.accessDays.includes(d.v)
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => {
                      const atual =
                        v.accessDays.length === 0 ? DIAS.map((x) => x.v) : [...v.accessDays]
                      const next = atual.includes(d.v)
                        ? atual.filter((x) => x !== d.v)
                        : [...atual, d.v].sort()
                      // Desmarcar tudo volta para "todos os dias" em vez de
                      // gravar uma regra que nunca abre.
                      set("accessDays", next.length === 0 || next.length === 7 ? [] : next)
                    }}
                    className={`h-10 w-14 rounded-md border text-sm transition ${
                      ativo
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-input text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            {v.accessDays.length === 0 && (
              <p className="text-xs text-muted-foreground">Todos os dias liberados.</p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="accessStart">A partir das</Label>
              <Input
                id="accessStart"
                type="time"
                className="w-36"
                value={v.accessStart ?? ""}
                onChange={(e) => set("accessStart", e.target.value || "")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accessEnd">Até as</Label>
              <Input
                id="accessEnd"
                type="time"
                className="w-36"
                value={v.accessEnd ?? ""}
                onChange={(e) => set("accessEnd", e.target.value || "")}
              />
            </div>
            <p className="flex-1 text-xs text-muted-foreground">
              A janela não vira o dia: o fim precisa ser depois do início. Horário de Brasília.
            </p>
          </div>

          {temHorario && alcance.parceira > 0 && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Nos cursos em que só o horário é aplicado, ele fecha o acesso do aluno como um
              todo, com precisão de até 15 minutos — e, se ele estuda em mais de uma unidade,
              só fecha quando estiver fora do horário em todas elas.
            </p>
          )}
        </Card>

        <div className="flex items-center justify-end gap-2">
          {acoes}
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar regras"}
          </Button>
        </div>
      </div>
    </WriteGate>
  )
}

/**
 * Cursos com regra propria + escolha de um curso para configurar. Fica FORA do
 * `WriteGate` (a pagina o renderiza a parte): quem so tem `pedagogia.view`
 * tambem precisa navegar ate a regra de um curso para CONSULTA-LA.
 */
export function CursosComRegra({
  cursos,
  overrides,
}: {
  cursos: CursoRegra[]
  overrides: CursoRegra[]
}) {
  const router = useRouter()
  const [escolhido, setEscolhido] = React.useState("")
  const comRegra = new Set(overrides.map((o) => o.courseId))
  const semRegra = cursos.filter((c) => !comRegra.has(c.courseId))

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Regra própria por curso</h2>
        <p className="text-sm text-muted-foreground">
          Um curso com regra própria ignora as regras acima. A mudança vale também para quem já
          comprou o curso.
        </p>
      </div>

      {overrides.length > 0 && (
        <ul className="divide-y text-sm">
          {overrides.map((o) => (
            <li key={o.courseId} className="flex items-center justify-between gap-3 py-2">
              <span>{o.nome}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {o.proprio ? "todas as regras" : "só horário"}
                </span>
                <Link
                  href={`/painel/pedagogia/cursos/${o.courseId}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Abrir
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      {semRegra.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cursoRegra">Definir regra para o curso</Label>
            <select
              id="cursoRegra"
              className="h-10 w-72 max-w-full rounded-md border border-input bg-background px-3 text-sm"
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
            >
              <option value="">Escolha um curso…</option>
              {semRegra.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={!escolhido}
            onClick={() => router.push(`/painel/pedagogia/cursos/${escolhido}`)}
          >
            Configurar
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Remove a regra propria do curso: ele volta a seguir o padrao da unidade. */
export function RemoverRegraCurso({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [removendo, setRemovendo] = React.useState(false)

  async function remover() {
    setRemovendo(true)
    try {
      const res = await fetch(`/api/painel/cursos/${courseId}/pedagogia`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível remover")
        return
      }
      toast.success("O curso voltou a seguir as regras da unidade")
      router.refresh()
    } catch {
      toast.error("Falha de conexão ao remover")
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <Button variant="ghost" onClick={remover} disabled={removendo}>
      {removendo ? "Removendo…" : "Voltar às regras da unidade"}
    </Button>
  )
}
