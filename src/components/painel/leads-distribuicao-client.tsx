"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2,
  Save,
  Users,
  UserRound,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

export interface DistribuicaoMember {
  userId: string
  name: string
  email: string
  active: boolean
  pendingInvite: boolean
}

interface Props {
  initialAutoAssign: boolean
  members: DistribuicaoMember[]
}

export function LeadsDistribuicaoClient({ initialAutoAssign, members }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [autoAssign, setAutoAssign] = useState(initialAutoAssign)

  const activeCount = members.filter((m) => m.active).length
  const isDirty = autoAssign !== initialAutoAssign

  function submit() {
    startTransition(async () => {
      const res = await fetch("/api/painel/leads/distribuicao", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoAssign }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(
        autoAssign
          ? "Distribuição automática ativada"
          : "Distribuição automática desativada",
      )
      router.refresh()
    })
  }

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-mist)] p-3">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
        <div className="text-xs text-[var(--color-pmb-green-900)]">
          Com a distribuição automática ligada, cada novo lead (formulário da
          vitrine ou checkout abandonado) é entregue em rodízio ao próximo
          consultor ativo da sua Equipe. Você ainda pode trocar o responsável
          de qualquer lead manualmente no quadro de Leads.
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <Switch
          checked={autoAssign}
          onCheckedChange={(c) => setAutoAssign(c)}
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Distribuir leads automaticamente (rodízio)
          </p>
          <p className="text-xs text-gray-600">
            Novos leads são atribuídos em sequência aos consultores ativos.
            Quando desligado, todos os leads chegam sem responsável e você
            distribui manualmente.
          </p>
        </div>
      </label>

      {autoAssign && activeCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Nenhum consultor ativo na Equipe. Enquanto não houver, os leads
            continuarão chegando sem responsável.
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Consultores no rodízio ({activeCount})
          </h3>
          <Link
            href="/painel/equipe"
            className="text-[11px] font-semibold text-[var(--color-pmb-green)] hover:underline"
          >
            Gerenciar equipe
          </Link>
        </div>
        <ul className="mt-2 space-y-1.5">
          {members.length === 0 && (
            <li className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400">
              Nenhum consultor cadastrado.{" "}
              <Link
                href="/painel/equipe"
                className="font-semibold text-[var(--color-pmb-green)] hover:underline"
              >
                Adicionar na Equipe
              </Link>
            </li>
          )}
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <UserRound className="h-3.5 w-3.5 text-gray-400" />
                {m.name}
              </span>
              {m.active ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  No rodízio
                </span>
              ) : (
                <span className="text-[11px] font-medium text-gray-400">
                  {m.pendingInvite ? "Convite pendente" : "Inativo"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending || !isDirty}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>
    </Card>
  )
}
