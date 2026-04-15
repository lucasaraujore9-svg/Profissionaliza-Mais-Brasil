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

export interface EquipeItem {
  id: string
  name: string
  email: string
  role: string
  status: string
  phone: string | null
  lastActiveAt: string | null
  pendingInvite: boolean
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PMB_SALES: "Vendas PMB",
  PMB_RESELLER_MGR: "Gerente de Revendedores",
}

const ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const

export function EquipeClient({ initialItems }: { initialItems: EquipeItem[] }) {
  const router = useRouter()
  const [items] = useState(initialItems)
  const [filter, setFilter] = useState<string>("ALL")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "PMB_SALES" as (typeof ROLES)[number],
    phone: "",
  })

  const filtered = items.filter((i) => (filter === "ALL" ? true : i.role === filter))

  function submitInvite() {
    if (!form.name || !form.email) {
      toast.error("Preencha nome e email")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/equipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao convidar")
        return
      }
      toast.success("Convite enviado")
      setOpen(false)
      setForm({ name: "", email: "", role: "PMB_SALES", phone: "" })
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
            Gerencie os usuários internos da Profissionaliza Mais Brasil
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
        >
          <Plus className="h-4 w-4 mr-2" />
          Convidar novo membro
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs uppercase text-muted-foreground">Filtrar papel</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "ALL")}>
          <SelectTrigger className="w-[220px]">
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
        <table className="w-full text-sm">
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
                <td className="px-4 py-3 font-medium">{u.name}</td>
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Convidar novo membro</SheetTitle>
            <SheetDescription>
              Um email será enviado com instruções para definir a senha.
            </SheetDescription>
          </SheetHeader>
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
              {pending ? "Enviando…" : "Enviar convite"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
