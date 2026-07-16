"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Plus, Mail } from "lucide-react"
import {
  ModeToggle,
  PasswordField,
  CredentialsResultPanel,
  type CreateMode,
} from "@/components/shared/account-credentials-fields"

export interface EquipeItem {
  id: string
  name: string
  email: string
  role: string
  status: string
  phone: string | null
  salesManagerId: string | null
  salesManagerName: string | null
  lastActiveAt: string | null
  pendingInvite: boolean
  createdAt: string
}

export interface SalesManagerOption {
  id: string
  name: string
}

const NO_MANAGER = "__none__"

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PMB_SALES: "Vendedor de curso",
  PMB_SALES_MGR: "Gerente de vendas",
  PMB_REVENDA_SALES: "Vendedor de revenda",
  PMB_RESELLER_MGR: "Gerente de unidades",
  PMB_FINANCEIRO: "Financeiro",
  PMB_DESIGNER: "Designer",
}

const ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_SALES_MGR", "PMB_REVENDA_SALES", "PMB_RESELLER_MGR", "PMB_FINANCEIRO", "PMB_DESIGNER"] as const

export function EquipeClient({
  initialItems,
  salesManagers,
}: {
  initialItems: EquipeItem[]
  salesManagers: SalesManagerOption[]
}) {
  const router = useRouter()
  const [items] = useState(initialItems)
  const [filter, setFilter] = useState<string>("ALL")
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
    role: "PMB_SALES" as (typeof ROLES)[number],
    phone: "",
    salesManagerId: NO_MANAGER,
    // Cap individual de desconto (%) — só PMB_SALES. "" = padrão da role (50).
    maxDiscount: "",
  })

  const filtered = items.filter((i) => (filter === "ALL" ? true : i.role === filter))

  function resetForm() {
    setForm({ name: "", email: "", role: "PMB_SALES", phone: "", salesManagerId: NO_MANAGER, maxDiscount: "" })
    setMode("invite")
    setPassword("")
    setCreated(null)
  }

  function openSheet() {
    resetForm()
    setOpen(true)
  }

  function submitInvite() {
    if (!form.name || !form.email) {
      toast.error("Preencha nome e email")
      return
    }
    if (mode === "password" && password && password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres")
      return
    }
    const maxDiscountNumber =
      form.role === "PMB_SALES" && form.maxDiscount.trim() !== ""
        ? Number(form.maxDiscount)
        : undefined
    if (
      maxDiscountNumber !== undefined &&
      (!Number.isInteger(maxDiscountNumber) || maxDiscountNumber < 0 || maxDiscountNumber > 100)
    ) {
      toast.error("Cap de desconto deve ser um inteiro entre 0 e 100")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/equipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          salesManagerId:
            form.role === "PMB_REVENDA_SALES" && form.salesManagerId !== NO_MANAGER
              ? form.salesManagerId
              : undefined,
          maxDiscount: maxDiscountNumber,
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
      if (mode === "password") {
        setCreated({
          email: form.email,
          password: body.tempPassword ?? password,
          emailSent: body.emailSent ?? false,
        })
        toast.success("Usuário criado")
      } else {
        toast.success("Convite enviado")
        setOpen(false)
        resetForm()
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            Equipe PMB
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os usuários internos do Profissionaliza Mais Brasil
          </p>
        </div>
        <Button
          onClick={openSheet}
          className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo membro
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Label className="text-xs uppercase text-muted-foreground">Filtrar papel</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "ALL")}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Papel</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Última atividade</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3 font-medium">
                  <div>{u.name}</div>
                  {u.role === "PMB_REVENDA_SALES" && (
                    <div className="text-xs font-normal text-muted-foreground">
                      Gerente: {u.salesManagerName ?? "—"}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-3">
                  {u.pendingInvite ? (
                    <Badge variant="secondary" className="gap-1">
                      <Mail className="h-3 w-3" /> convite pendente
                    </Badge>
                  ) : u.status === "ATIVO" ? (
                    <Badge className="bg-emerald-100 text-emerald-900">Ativo</Badge>
                  ) : (
                    <Badge variant="outline">Inativo</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.lastActiveAt
                    ? new Date(u.lastActiveAt).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/equipe/${u.id}`}
                    className="text-[var(--color-pmb-green)] font-semibold hover:underline"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum membro encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{created ? "Membro criado" : "Novo membro"}</SheetTitle>
            <SheetDescription>
              {created
                ? "Conta criada com senha. Repasse as credenciais abaixo."
                : mode === "invite"
                  ? "Um email será enviado com instruções para definir a senha."
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
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
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
                  <Label>Telefone (opcional)</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Papel</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm({ ...form, role: v as (typeof ROLES)[number] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.role === "PMB_REVENDA_SALES" && (
                  <div>
                    <Label>Gerente de vendas</Label>
                    <Select
                      value={form.salesManagerId}
                      onValueChange={(v) =>
                        setForm({ ...form, salesManagerId: v ?? NO_MANAGER })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>— Sem gerente —</SelectItem>
                        {salesManagers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.role === "PMB_SALES" && (
                  <div>
                    <Label>Cap de desconto (%)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      placeholder="50 (padrão)"
                      value={form.maxDiscount}
                      onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Teto do desconto manual e da criação de cupons próprios.
                      Não limita aplicar cupons existentes. Vazio = 50%.
                    </p>
                  </div>
                )}
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
                  onClick={submitInvite}
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
