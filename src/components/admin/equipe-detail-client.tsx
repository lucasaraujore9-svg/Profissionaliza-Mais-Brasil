"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Mail, UserX, UserCheck } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { EquipeImpersonateButton } from "./equipe-impersonate-button"
import { PMB_ROLE_LABEL, PMB_TEAM_ROLES, pmbRoleLabel } from "@/lib/auth/roles"

export interface EquipeMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  phone: string | null
  image: string | null
  salesManagerId: string | null
  salesManagerName: string | null
  maxDiscount: number | null
  lastActiveAt: string | null
  pendingInvite: boolean
  createdAt: string
}

export interface SalesManagerOption {
  id: string
  name: string
}

const NO_MANAGER = "__none__"

const ROLE_LABEL = PMB_ROLE_LABEL
const ROLES = PMB_TEAM_ROLES

export function EquipeDetailClient({
  member,
  isSelf,
  salesManagers,
}: {
  member: EquipeMember
  isSelf: boolean
  salesManagers: SalesManagerOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: member.name,
    email: member.email,
    phone: member.phone ?? "",
    role: member.role as (typeof ROLES)[number],
    status: member.status as "ATIVO" | "INATIVO",
    salesManagerId: member.salesManagerId ?? NO_MANAGER,
    // Cap individual de desconto (%) — só PMB_SALES. "" = padrão da role (50).
    maxDiscount: member.maxDiscount == null ? "" : String(member.maxDiscount),
  })

  function save() {
    const maxDiscountNumber =
      form.role === "PMB_SALES" && form.maxDiscount.trim() !== ""
        ? Number(form.maxDiscount)
        : null
    if (
      maxDiscountNumber !== null &&
      (!Number.isInteger(maxDiscountNumber) || maxDiscountNumber < 0 || maxDiscountNumber > 100)
    ) {
      toast.error("Cap de desconto deve ser um inteiro entre 0 e 100")
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/admin/equipe/${member.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          role: form.role,
          status: form.status,
          salesManagerId:
            form.role === "PMB_REVENDA_SALES" && form.salesManagerId !== NO_MANAGER
              ? form.salesManagerId
              : null,
          maxDiscount: maxDiscountNumber,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success("Salvo")
      router.refresh()
    })
  }

  function toggleStatus() {
    const next = form.status === "ATIVO" ? "INATIVO" : "ATIVO"
    startTransition(async () => {
      const res = await fetch(`/api/admin/equipe/${member.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha")
        return
      }
      setForm({ ...form, status: next })
      toast.success(next === "ATIVO" ? "Reativado" : "Suspenso")
      router.refresh()
    })
  }

  function resendInvite() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/equipe/${member.id}/resend-invite`, {
        method: "POST",
      })
      if (!res.ok) {
        toast.error("Falha ao reenviar convite")
        return
      }
      toast.success("Convite reenviado")
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/equipe"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            {member.name}
          </h1>
          <p className="text-sm text-muted-foreground">{member.email}</p>
          <div className="mt-2 flex gap-2">
            <Badge variant="outline">{pmbRoleLabel(member.role)}</Badge>
            {member.pendingInvite ? (
              <Badge variant="secondary" className="gap-1">
                <Mail className="h-3 w-3" /> convite pendente
              </Badge>
            ) : form.status === "ATIVO" ? (
              <Badge className="bg-emerald-100 text-emerald-900">Ativo</Badge>
            ) : (
              <Badge variant="outline">Inativo</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {member.pendingInvite && (
            <Button variant="outline" onClick={resendInvite} disabled={pending}>
              <Mail className="h-4 w-4 mr-2" /> Reenviar convite
            </Button>
          )}
          {/* Impersonação interna: só membro ativo, já onboardado, que não seja
              você nem outro super (o backend reforça os mesmos limites). */}
          {!isSelf &&
            member.role !== "SUPER_ADMIN" &&
            !member.pendingInvite &&
            form.status === "ATIVO" && (
              <EquipeImpersonateButton userId={member.id} userName={member.name} />
            )}
          {!isSelf && (
            <Button
              variant="outline"
              onClick={toggleStatus}
              disabled={pending}
            >
              {form.status === "ATIVO" ? (
                <>
                  <UserX className="h-4 w-4 mr-2" /> Suspender
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" /> Reativar
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-4 max-w-2xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Dados
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label>Telefone</Label>
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
              disabled={isSelf}
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
                Teto do desconto manual na venda e da criação de cupons próprios.
                Não limita a aplicação de cupons existentes. Vazio = padrão de 50%.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={pending}
            className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
          >
            {pending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 max-w-2xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Auditoria
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Criado em</dt>
          <dd>{new Date(member.createdAt).toLocaleString("pt-BR")}</dd>
          <dt className="text-muted-foreground">Última atividade</dt>
          <dd>
            {member.lastActiveAt
              ? new Date(member.lastActiveAt).toLocaleString("pt-BR")
              : "—"}
          </dd>
        </dl>
      </div>
    </div>
  )
}
