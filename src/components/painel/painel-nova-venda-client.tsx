"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Copy, ExternalLink, Loader2 } from "lucide-react"
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
  /** Link da NOSSA página de pagamento transparente (não é o site do MP). */
  paymentUrl?: string
  basePrice?: number
  finalAmount: number
  discountAmount?: number
  scholarship?: boolean
}

export function PainelNovaVendaClient({ courses }: { courses: CourseOption[] }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<CreatedVenda | null>(null)
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    fone: "",
    tenantCourseId: "",
    couponCode: "",
    bolsista: false,
  })

  const selectedCourse = courses.find((c) => c.id === form.tenantCourseId) ?? null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

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
          couponCode: form.bolsista ? undefined : form.couponCode.trim() || undefined,
          bolsista: form.bolsista || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        const fields = body.fields as
          | Record<string, string[] | undefined>
          | undefined
        if (fields) {
          const mapped: Record<string, string> = {}
          for (const [key, msgs] of Object.entries(fields)) {
            if (msgs && msgs.length) mapped[key] = msgs[0]
          }
          setFieldErrors(mapped)
        }
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
    if (!created?.paymentUrl) return
    await navigator.clipboard.writeText(created.paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (created) {
    return (
      <div className="space-y-5">
        {created.scholarship ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h2 className="text-base font-bold">
              Bolsa de estudo concedida
            </h2>
            <p className="mt-2 text-sm">
              O aluno foi matriculado na plataforma de aulas <strong>sem cobrança</strong>.
              As credenciais de acesso foram enviadas para o e-mail informado.
            </p>
          </div>
        ) : (
        <div className="rounded-2xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-6 text-[var(--color-pmb-green-900)]">
          <h2 className="text-base font-bold">
            Venda criada — link de pagamento gerado
          </h2>
          <p className="mt-2 text-sm">
            Envie o link abaixo para o aluno finalizar o pagamento na sua própria
            loja (cartão, PIX ou boleto — sem sair do site). A matrícula é ativada
            automaticamente após a confirmação do pagamento.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Mini label="Original" value={formatBRL(created.basePrice ?? 0)} />
            <Mini label="Desconto" value={formatBRL(created.discountAmount ?? 0)} />
            <Mini
              label="Final"
              value={formatBRL(created.finalAmount)}
              accent
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={created.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              Abrir link de pagamento
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)]/30 bg-white px-4 py-2.5 text-xs font-bold text-[var(--color-pmb-green-700)] hover:bg-[var(--color-pmb-green)]/5"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Link copiado" : "Copiar link"}
            </button>
          </div>
        </div>
        )}

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
                bolsista: false,
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
      <div
        data-tour="vendas-nova:aluno"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
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
              aria-invalid={!!fieldErrors.nome}
              aria-describedby={fieldErrors.nome ? "v-nome-error" : undefined}
              className="mt-1.5"
            />
            {fieldErrors.nome && (
              <p id="v-nome-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.nome}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="v-email">Email</Label>
            <Input
              id="v-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "v-email-error" : undefined}
              className="mt-1.5"
            />
            {fieldErrors.email && (
              <p id="v-email-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="v-fone">Celular</Label>
            <Input
              id="v-fone"
              value={form.fone}
              onChange={(e) => setForm({ ...form, fone: e.target.value })}
              required
              placeholder="(11) 99999-9999"
              aria-invalid={!!fieldErrors.fone}
              aria-describedby={fieldErrors.fone ? "v-fone-error" : undefined}
              className="mt-1.5"
            />
            {fieldErrors.fone && (
              <p id="v-fone-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.fone}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="v-cpf">CPF</Label>
            <Input
              id="v-cpf"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              required
              placeholder="Apenas números"
              aria-invalid={!!fieldErrors.cpf}
              aria-describedby={fieldErrors.cpf ? "v-cpf-error" : undefined}
              className="mt-1.5"
            />
            {fieldErrors.cpf && (
              <p id="v-cpf-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.cpf}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
          Curso e pagamento
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div data-tour="vendas-nova:curso" className="sm:col-span-2">
            <Label htmlFor="v-curso">Curso da sua vitrine</Label>
            <Select
              value={form.tenantCourseId}
              onValueChange={(v) =>
                setForm({ ...form, tenantCourseId: v ?? "" })
              }
            >
              <SelectTrigger
                id="v-curso"
                className="mt-1.5 h-10 w-full"
                aria-invalid={!!fieldErrors.tenantCourseId}
              >
                <SelectValue placeholder="Selecione um curso…" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} — {formatBRL(c.price)}
                    {c.paymentType === "MONTHLY" ? "/mês" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.tenantCourseId && (
              <p className="mt-1 text-xs text-rose-600">
                {fieldErrors.tenantCourseId}
              </p>
            )}
            {selectedCourse && (
              <p className="mt-1.5 text-xs text-gray-500">
                Tipo: {selectedCourse.paymentType === "MONTHLY"
                  ? "Mensalidade recorrente"
                  : "Pagamento único"}
              </p>
            )}
          </div>
          <div data-tour="vendas-nova:cupom">
            <Label htmlFor="v-cupom">Cupom (opcional)</Label>
            <Input
              id="v-cupom"
              value={form.couponCode}
              onChange={(e) =>
                setForm({ ...form, couponCode: e.target.value.toUpperCase() })
              }
              disabled={form.bolsista}
              aria-invalid={!!fieldErrors.couponCode}
              aria-describedby={
                fieldErrors.couponCode ? "v-cupom-error" : undefined
              }
              className="mt-1.5"
              placeholder="Ex: BLACKFRIDAY"
            />
            {fieldErrors.couponCode && (
              <p id="v-cupom-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.couponCode}
              </p>
            )}
            {form.bolsista && (
              <p className="mt-1.5 text-xs text-gray-400">
                Indisponível para bolsistas — a matrícula é gratuita.
              </p>
            )}
          </div>
        </div>

        <label
          data-tour="vendas-nova:bolsista"
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <input
            type="checkbox"
            checked={form.bolsista}
            onChange={(e) => setForm({ ...form, bolsista: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-amber-600"
          />
          <span className="text-sm">
            <span className="font-semibold text-amber-900">Bolsista (bolsa de estudo)</span>
            <span className="mt-0.5 block text-xs text-amber-700">
              Matricula o aluno na plataforma de aulas <strong>sem gerar cobrança</strong> no
              Mercado Pago. Nenhum link de pagamento é criado.
            </span>
          </span>
        </label>
      </div>

      {selectedCourse && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
            Resumo do pedido
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">Valor original</dt>
              <dd className="font-mono text-gray-900">
                {formatBRL(selectedCourse.price)}
                {selectedCourse.paymentType === "MONTHLY" ? "/mês" : ""}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">
                {form.bolsista ? "Bolsa de estudo" : "Cupom"}
              </dt>
              <dd className="font-mono text-gray-900">
                {form.bolsista
                  ? `- ${formatBRL(selectedCourse.price)}`
                  : form.couponCode.trim()
                    ? "a confirmar"
                    : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <dt className="font-semibold text-[var(--color-pmb-green-900)]">
                Total a pagar
              </dt>
              <dd className="font-mono text-base font-bold text-[var(--color-pmb-green-700)]">
                {form.bolsista
                  ? formatBRL(0)
                  : form.couponCode.trim()
                    ? `até ${formatBRL(selectedCourse.price)}`
                    : formatBRL(selectedCourse.price)}
                {!form.bolsista && selectedCourse.paymentType === "MONTHLY"
                  ? "/mês"
                  : ""}
              </dd>
            </div>
          </dl>
          {!form.bolsista && form.couponCode.trim() && (
            <p className="mt-2 text-xs text-gray-500">
              O desconto do cupom é validado ao gerar o link de pagamento.
            </p>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
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
          data-tour="vendas-nova:submit"
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {form.bolsista ? "Concedendo bolsa..." : "Gerando link..."}
            </>
          ) : form.bolsista ? (
            "Conceder bolsa de estudo"
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
    <div className="rounded-lg border border-[var(--color-pmb-green)]/20 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-pmb-green-700)]">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-base font-bold ${
          accent
            ? "text-[var(--color-pmb-green-700)]"
            : "text-[var(--color-pmb-green-900)]"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
