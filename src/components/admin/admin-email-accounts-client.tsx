"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Mail, Plus, Trash2, KeyRound, AlertTriangle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { SmtpAccountView } from "@/lib/email/smtp-pool"

/** Mesmo limiar do alerta do servidor (`SMTP_ALERT_RATIO`). */
const ALERT_RATIO = 0.8

async function call(url: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.ok) return true
  const data = await res.json().catch(() => ({}))
  toast.error(data.error ?? "Falha ao salvar")
  return false
}

export function AdminEmailAccountsClient({ accounts }: { accounts: SmtpAccountView[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [dailyLimit, setDailyLimit] = useState("100")

  const totalSent = accounts.reduce((s, a) => s + a.sentToday, 0)
  const totalLimit = accounts.filter((a) => a.active).reduce((s, a) => s + a.dailyLimit, 0)

  function run(fn: () => Promise<boolean>, ok: string) {
    startTransition(async () => {
      if (await fn()) {
        toast.success(ok)
        router.refresh()
      }
    })
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    run(async () => {
      const done = await call("/api/admin/email-accounts", "POST", {
        email,
        password,
        dailyLimit: Number(dailyLimit),
      })
      if (done) {
        setEmail("")
        setPassword("")
      }
      return done
    }, "Caixa adicionada")
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="flex items-start gap-3 p-4">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
        <p className="text-sm text-gray-700">
          Os e-mails do sistema são distribuídos entre as caixas ativas: cada envio sai pela caixa
          que menos enviou hoje. Ao chegar a 80% do limite diário de uma caixa, você recebe um
          aviso aqui no sistema e por e-mail. O contador zera à meia-noite (horário de Brasília).
          <br />
          <strong>
            Hoje: {totalSent} de {totalLimit} envios disponíveis nas caixas ativas.
          </strong>
        </p>
      </Card>

      <div className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-gray-500">
            Nenhuma caixa cadastrada. Enquanto isso, o envio usa a caixa configurada no servidor.
          </p>
        )}
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} pending={pending} run={run} />
        ))}
      </div>

      <Card className="p-5">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_1fr_110px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-email">E-mail da caixa</Label>
            <Input
              id="smtp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="noreply@profissionalizamaisbrasil.com.br"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-password">Senha</Label>
            <Input
              id="smtp-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-limit">Limite/dia</Label>
            <Input
              id="smtp-limit"
              type="number"
              min={1}
              required
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </form>
        <p className="mt-3 text-xs text-gray-500">
          Servidor padrão: smtp.hostinger.com, porta 465 (SSL). A senha é guardada criptografada e
          não é exibida de novo.
        </p>
      </Card>
    </div>
  )
}

function AccountRow({
  account: a,
  pending,
  run,
}: {
  account: SmtpAccountView
  pending: boolean
  run: (fn: () => Promise<boolean>, ok: string) => void
}) {
  const [newPassword, setNewPassword] = useState("")
  const [editing, setEditing] = useState(false)
  const ratio = a.dailyLimit > 0 ? a.sentToday / a.dailyLimit : 0
  const bar =
    ratio >= 1 ? "bg-red-500" : ratio >= ALERT_RATIO ? "bg-amber-500" : "bg-[var(--color-pmb-green)]"
  const url = `/api/admin/email-accounts/${a.id}`

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-pmb-green-900)]">{a.email}</p>
          <p className="text-xs text-gray-500">
            {a.host}:{a.port}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <Switch
              checked={a.active}
              disabled={pending}
              onCheckedChange={(active) =>
                run(() => call(url, "PATCH", { active }), active ? "Caixa ativada" : "Caixa pausada")
              }
            />
            {a.active ? "Ativa" : "Pausada"}
          </label>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            <KeyRound className="h-4 w-4" />
            Senha
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Remover ${a.email}`}
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Remover ${a.email} do rodízio de envio?`)) {
                run(() => call(url, "DELETE"), "Caixa removida")
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-gray-600">Enviados hoje</span>
          <span className="font-semibold tabular-nums">
            {a.sentToday} / {a.dailyLimit}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={a.sentToday}
          aria-valuemin={0}
          aria-valuemax={a.dailyLimit}
          aria-label={`Envios de hoje de ${a.email}`}
        >
          <div className={`h-full ${bar}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
        </div>
      </div>

      {a.lastError && (
        <p className="flex items-start gap-1.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Última falha
            {a.lastErrorAt ? ` (${new Date(a.lastErrorAt).toLocaleString("pt-BR")})` : ""}: {a.lastError}
          </span>
        </p>
      )}

      {editing && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const done = await call(url, "PATCH", { password: newPassword })
              if (done) {
                setNewPassword("")
                setEditing(false)
              }
              return done
            }, "Senha atualizada")
          }}
        >
          <Input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Nova senha"
            aria-label={`Nova senha de ${a.email}`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
      )}
    </Card>
  )
}
