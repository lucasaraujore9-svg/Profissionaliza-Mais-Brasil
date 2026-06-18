"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Mail, UserX, UserCheck, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/painel/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import {
  ModeToggle,
  PasswordField,
  CredentialsResultPanel,
  type CreateMode,
} from "@/components/shared/account-credentials-fields"

export interface ConsultantItem {
  membershipId: string
  userId: string
  name: string
  email: string
  maxDiscount: number | null
  status: string
  pendingInvite: boolean
  lastActiveAt: string | null
  createdAt: string
}

export function EquipePainelClient({
  tenantName,
  initialItems,
}: {
  tenantName: string
  initialItems: ConsultantItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<CreateMode>("invite")
  const [password, setPassword] = useState("")
  const [created, setCreated] = useState<
    { email: string; password: string; emailSent: boolean } | null
  >(null)
  const [toRemove, setToRemove] = useState<ConsultantItem | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: "",
    maxDiscount: "",
  })

  function resetForm() {
    setForm({ name: "", email: "", maxDiscount: "" })
    setMode("invite")
    setPassword("")
    setCreated(null)
  }

  function openSheet() {
    resetForm()
    setOpen(true)
  }

  function submit() {
    if (!form.name || !form.email) {
      toast.error("Preencha nome e email")
      return
    }
    const maxDiscount = form.maxDiscount ? Number(form.maxDiscount) : undefined
    if (maxDiscount !== undefined && (Number.isNaN(maxDiscount) || maxDiscount < 0 || maxDiscount > 100)) {
      toast.error("Cap de desconto deve ser 0-100")
      return
    }
    if (mode === "password" && password && password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/painel/equipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          maxDiscount,
          mode,
          password: mode === "password" && password ? password : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao criar")
        return
      }
      const body = await res.json().catch(() => ({}))
      if (mode === "password" && body.tempPassword) {
        setCreated({
          email: form.email,
          password: body.tempPassword,
          emailSent: body.emailSent ?? false,
        })
        toast.success("Consultor criado")
      } else {
        toast.success(mode === "password" ? "Consultor adicionado" : "Convite enviado")
        setOpen(false)
        resetForm()
      }
      router.refresh()
    })
  }

  function toggle(item: ConsultantItem) {
    const next = item.status === "ATIVO" ? "INATIVO" : "ATIVO"
    startTransition(async () => {
      const res = await fetch(`/api/painel/equipe/${item.membershipId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        toast.error("Falha ao atualizar")
        return
      }
      router.refresh()
    })
  }

  function resend(item: ConsultantItem) {
    startTransition(async () => {
      const res = await fetch(`/api/painel/equipe/${item.membershipId}/resend-invite`, {
        method: "POST",
      })
      if (!res.ok) {
        toast.error("Falha ao reenviar")
        return
      }
      toast.success("Convite reenviado")
    })
  }

  function remove(item: ConsultantItem) {
    startTransition(async () => {
      const res = await fetch(`/api/painel/equipe/${item.membershipId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Falha ao remover")
        return
      }
      setToRemove(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Equipe de ${tenantName}`}
        description="Consultores que ajudam a vender cursos na sua vitrine"
        actions={
          <Button
            onClick={openSheet}
            className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
          >
            <Plus className="h-4 w-4 mr-2" /> Novo consultor
          </Button>
        }
      />

      {initialItems.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum consultor cadastrado"
          description="Convide consultores para ajudar a vender cursos na sua vitrine."
          action={
            <Button
              onClick={openSheet}
              className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
            >
              <Plus className="h-4 w-4 mr-2" /> Novo consultor
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-pmb-green-900)]/10 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-[var(--color-pmb-green-900)]">Nome</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-pmb-green-900)]">Email</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-pmb-green-900)]">Cap desconto</th>
                <th className="px-4 py-3 font-semibold text-[var(--color-pmb-green-900)]">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialItems.map((c) => (
                <tr
                  key={c.membershipId}
                  className="border-t transition-colors hover:bg-[var(--color-pmb-lime-50)]/50"
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3 font-mono">
                    {c.maxDiscount !== null ? `${c.maxDiscount}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.pendingInvite ? (
                      <StatusBadge tone="warning">Convite pendente</StatusBadge>
                    ) : c.status === "ATIVO" ? (
                      <StatusBadge tone="success">Ativo</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Inativo</StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {c.pendingInvite && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resend(c)}
                        disabled={pending}
                        title="Reenviar convite"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle(c)}
                      disabled={pending}
                      title={c.status === "ATIVO" ? "Suspender" : "Reativar"}
                    >
                      {c.status === "ATIVO" ? (
                        <UserX className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setToRemove(c)}
                      disabled={pending}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog
        open={toRemove !== null}
        onOpenChange={(o) => !o && setToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover consultor</AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove
                ? `Remover ${toRemove.name} da equipe? Esta ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                if (toRemove) remove(toRemove)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{created ? "Consultor criado" : "Novo consultor"}</SheetTitle>
            <SheetDescription>
              {created
                ? "Conta criada com senha. Repasse as credenciais abaixo."
                : mode === "invite"
                  ? "Ele receberá um email para definir a senha e acessar o painel."
                  : "A conta será criada já com senha e as credenciais enviadas por email."}
            </SheetDescription>
          </SheetHeader>

          {created ? (
            <>
              <div className="p-4">
                <CredentialsResultPanel
                  email={created.email}
                  password={created.password}
                  emailSent={created.emailSent}
                />
              </div>
              <SheetFooter>
                <Button
                  onClick={() => {
                    setOpen(false)
                    resetForm()
                  }}
                  className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
                >
                  Concluir
                </Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 p-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cap de desconto (% — opcional)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    placeholder="Ex: 20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deixe vazio para não limitar desconto em cupons.
                  </p>
                </div>
                <ModeToggle mode={mode} onChange={setMode} disabled={pending} />
                {mode === "password" && (
                  <PasswordField value={password} onChange={setPassword} disabled={pending} />
                )}
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  onClick={submit}
                  disabled={pending}
                  className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
                >
                  {pending
                    ? "Salvando…"
                    : mode === "invite"
                      ? "Enviar convite"
                      : "Criar com senha"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
