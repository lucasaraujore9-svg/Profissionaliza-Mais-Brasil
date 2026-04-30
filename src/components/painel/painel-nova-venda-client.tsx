"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Copy, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CourseOption {
  id: string
  nome: string
  price: number
  paymentType: "ONE_TIME" | "MONTHLY"
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface CreatedVenda {
  enrollmentId: string
  initPoint: string
  basePrice: number
  finalAmount: number
  discountAmount: number
}

export function PainelNovaVendaClient({ courses }: { courses: CourseOption[] }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedVenda | null>(null)
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    fone: "",
    tenantCourseId: "",
    couponCode: "",
  })

  const selectedCourse = courses.find((c) => c.id === form.tenantCourseId) ?? null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/painel/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          cpf: form.cpf.replace(/\D/g, ""),
          fone: form.fone.replace(/\D/g, ""),
          tenantCourseId: form.tenantCourseId,
          couponCode: form.couponCode.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        const fields = body.fields as
          | Record<string, string[] | undefined>
          | undefined
        const firstError =
          fields && Object.values(fields).find((arr) => arr && arr.length)
        setError(firstError?.[0] ?? body.error ?? "Erro ao gerar venda")
        return
      }
      setCreated(body.data as CreatedVenda)
    } catch {
      setError("Erro de rede")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!created) return
    await navigator.clipboard.writeText(created.initPoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (created) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          <h2 className="text-base font-bold">
            Venda criada — link de pagamento gerado
          </h2>
          <p className="mt-2 text-sm">
            Envie o link abaixo para o aluno finalizar o pagamento. A
            matrícula é ativada automaticamente após o pagamento ser
            confirmado pelo Mercado Pago.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Mini label="Original" value={formatBRL(created.basePrice)} />
            <Mini label="Desconto" value={formatBRL(created.discountAmount)} />
            <Mini
              label="Final"
              value={formatBRL(created.finalAmount)}
              accent
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={created.initPoint}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              Abrir checkout do Mercado Pago
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Link copiado" : "Copiar link"}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCreated(null)
              setForm((f) => ({
                ...f,
                nome: "",
                email: "",
                cpf: "",
                fone: "",
                couponCode: "",
              }))
            }}
          >
            Nova venda
          </Button>
          <Link href="/painel/vendas">
            <Button
              variant="outline"
              type="button"
              className="text-[var(--color-pmb-green-900)]"
            >
              Ver minhas vendas
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
          Dados do aluno
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Se o CPF já existir nos seus alunos, atualizamos os dados.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="v-nome">Nome completo</Label>
            <Input
              id="v-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
              minLength={3}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-email">Email</Label>
            <Input
              id="v-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="v-fone">Celular</Label>
            <Input
              id="v-fone"
              value={form.fone}
              onChange={(e) => setForm({ ...form, fone: e.target.value })}
              required
              placeholder="(11) 99999-9999"
              className="mt-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="v-cpf">CPF</Label>
            <Input
              id="v-cpf"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              required
              placeholder="Apenas números"
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
          Curso e pagamento
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="v-curso">Curso da sua vitrine</Label>
            <select
              id="v-curso"
              value={form.tenantCourseId}
              onChange={(e) =>
                setForm({ ...form, tenantCourseId: e.target.value })
              }
              required
              className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="">Selecione um curso…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} — {formatBRL(c.price)}
                  {c.paymentType === "MONTHLY" ? "/mês" : ""}
                </option>
              ))}
            </select>
            {selectedCourse && (
              <p className="mt-1.5 text-xs text-gray-500">
                Tipo: {selectedCourse.paymentType === "MONTHLY"
                  ? "Mensalidade recorrente"
                  : "Pagamento único"}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="v-cupom">Cupom (opcional)</Label>
            <Input
              id="v-cupom"
              value={form.couponCode}
              onChange={(e) =>
                setForm({ ...form, couponCode: e.target.value.toUpperCase() })
              }
              className="mt-1.5"
              placeholder="Ex: BLACKFRIDAY"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Link href="/painel/vendas">
          <Button type="button" variant="outline">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Button>
        </Link>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando link...
            </>
          ) : (
            "Gerar link de pagamento"
          )}
        </Button>
      </div>
    </form>
  )
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
        {label}
      </p>
      <p
        className={`mt-1 text-base font-bold ${
          accent ? "text-emerald-700" : "text-emerald-900"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
