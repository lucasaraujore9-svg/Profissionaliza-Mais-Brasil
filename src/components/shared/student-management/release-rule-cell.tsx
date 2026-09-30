"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCan } from "@/components/shared/permissions/permission-context"
import type { StudentEnrollmentItem } from "./types"

type Rule = NonNullable<StudentEnrollmentItem["releaseRule"]>

const MODOS: { v: Rule["releaseMode"]; titulo: string }[] = [
  { v: "FREE", titulo: "Livre" },
  { v: "SEQUENTIAL", titulo: "Sequencial" },
  { v: "DRIP", titulo: "Gotejamento" },
]

function describe(r: Rule): string {
  if (r.releaseMode === "FREE") return "Livre"
  if (r.releaseMode === "SEQUENTIAL") return "Sequencial"
  return `1 ${r.dripUnit === "MODULE" ? "módulo" : "aula"} a cada ${r.dripDays} dia(s)`
}

/**
 * Ordem de liberação das aulas de UMA matrícula, trocável pela unidade depois
 * da venda (livre / sequencial / gotejamento). A API é quem manda; `useCan` só
 * esconde o botão de quem não pode alterar.
 */
export function ReleaseRuleCell({ url, rule }: { url: string; rule: Rule | null }) {
  const router = useRouter()
  const canEdit = useCan("pedagogia.manage")
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<Rule | null>(rule)
  const [saving, setSaving] = useState(false)

  if (!rule || !v) return <span className="text-xs text-gray-400">—</span>

  async function send(method: "PUT" | "DELETE") {
    setSaving(true)
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method === "PUT"
            ? JSON.stringify({ releaseMode: v!.releaseMode, dripDays: v!.dripDays, dripUnit: v!.dripUnit })
            : undefined,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao alterar a ordem das aulas")
        return
      }
      toast.success(method === "PUT" ? "Ordem das aulas alterada para este aluno" : "Aluno voltou a seguir a regra do curso")
      setOpen(false)
      router.refresh()
    } catch {
      toast.error("Erro de rede ao alterar a ordem das aulas")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-gray-700">{describe(rule)}</div>
      <p className="text-[11px] text-gray-500">{rule.custom ? "Regra só deste aluno" : "Regra do curso"}</p>
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => {
            setV(rule)
            setOpen(true)
          }}
        >
          Alterar
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ordem de liberação das aulas</DialogTitle>
            <DialogDescription>
              Vale só para este aluno neste curso. O que ele já concluiu continua liberado para revisão.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            {MODOS.map((m) => (
              <button
                key={m.v}
                type="button"
                onClick={() => setV({ ...v, releaseMode: m.v })}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  v.releaseMode === m.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                }`}
              >
                {m.titulo}
              </button>
            ))}
          </div>

          {v.releaseMode === "DRIP" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rr-unit">Libera um novo</Label>
                  <select
                    id="rr-unit"
                    className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm"
                    value={v.dripUnit}
                    onChange={(e) => setV({ ...v, dripUnit: e.target.value as Rule["dripUnit"] })}
                  >
                    <option value="MODULE">módulo</option>
                    <option value="LESSON">aula</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rr-days">a cada (dias)</Label>
                  <Input
                    id="rr-days"
                    type="number"
                    min={1}
                    max={90}
                    className="w-24"
                    value={v.dripDays}
                    onChange={(e) => setV({ ...v, dripDays: Math.min(90, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Conta a partir da data da matrícula: o que já teria sido liberado até hoje abre na hora.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {rule.custom ? (
              <Button variant="ghost" disabled={saving} onClick={() => send("DELETE")}>
                Voltar à regra do curso
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={saving} onClick={() => send("PUT")}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
