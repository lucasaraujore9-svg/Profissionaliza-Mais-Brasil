"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Mail, UserX, UserCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
    if (!confirm(`Remover ${item.name} da equipe?`)) return
    startTransition(async () => {
      const res = await fetch(`/api/painel/equipe/${item.membershipId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Falha ao remover")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            Equipe de {tenantName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Consultores que ajudam a vender cursos na sua vitrine
          </p>
        </div>
        <Button
          onClick={openSheet}
          className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo consultor
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Cap desconto</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {initialItems.map((c) => (
              <tr key={c.membershipId} className="border-t">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3">
                  {c.maxDiscount !== null ? `${c.maxDiscount}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  {c.pendingInvite ? (
                    <Badge variant="secondary" className="gap-1">
                      <Mail className="h-3 w-3" /> convite pendente
                    </Badge>
                  ) : c.status === "ATIVO" ? (
                    <Badge className="bg-emerald-100 text-emerald-900">Ativo</Badge>
                  ) : (
                    <Badge variant="outline">Inativo</Badge>
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
                    onClick={() => remove(c)}
                    disabled={pending}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {initialItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum consultor cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
