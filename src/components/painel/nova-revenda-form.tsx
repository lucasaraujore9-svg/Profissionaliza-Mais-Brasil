"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateResult {
  tenant: { id: string; slug: string; name: string; status: string }
  owner: { id: string; email: string }
  tempPassword: string | null
  vitrineUrl: string
  asaas: { free: boolean; invoiceUrl: string | null; error: string | null }
  email: { sent: boolean }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  slug: "Endereço (slug)",
  ownerName: "Nome do responsável",
  ownerEmail: "E-mail",
  ownerCpfCnpj: "CPF/CNPJ",
  ownerPhone: "Telefone",
  planValue: "Mensalidade",
}

export function NovaRevendaForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerName, setOwnerName] = useState("")
  const [ownerEmail, setOwnerEmail] = useState("")
  const [ownerCpfCnpj, setOwnerCpfCnpj] = useState("")
  const [ownerPhone, setOwnerPhone] = useState("")
  const [planValue, setPlanValue] = useState("")
  const [installments, setInstallments] = useState("1")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<CreateResult | null>(null)

  function onName(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const res = await fetch("/api/painel/revendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          ownerName,
          ownerEmail,
          ownerCpfCnpj: ownerCpfCnpj.replace(/\D/g, ""),
          ownerPhone: ownerPhone.trim() || undefined,
          planValue: Number(planValue) || 0,
          firstPaymentMaxInstallments: Number(installments) || 1,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        if (payload.fields) {
          const mapped: Record<string, string> = {}
          for (const [k, v] of Object.entries(payload.fields)) {
            const first = Array.isArray(v) ? v[0] : undefined
            if (first) mapped[k] = first as string
          }
          setFieldErrors(mapped)
        }
        setError(payload.error ?? "Não foi possível criar a revenda.")
        return
      }
      setResult(payload.data as CreateResult)
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Revenda criada!</h2>
        </div>
        <p className="mt-2 text-sm text-green-800">
          A unidade <strong>{result.tenant.name}</strong> foi criada e atrelada a
          você. {result.email.sent
            ? "As credenciais de acesso foram enviadas por e-mail ao responsável."
            : "Repasse as credenciais abaixo ao responsável."}
        </p>

        <dl className="mt-4 space-y-2 rounded-xl bg-white p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Vitrine</dt>
            <dd>
              <a
                href={result.vitrineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--color-pmb-green)] hover:underline"
              >
                {result.vitrineUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">E-mail do responsável</dt>
            <dd className="font-medium">{result.owner.email}</dd>
          </div>
          {result.tempPassword && (
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Senha temporária</dt>
              <dd className="font-mono font-semibold">{result.tempPassword}</dd>
            </div>
          )}
          {!result.asaas.free && result.asaas.invoiceUrl && (
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">1ª cobrança</dt>
              <dd>
                <a
                  href={result.asaas.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--color-pmb-green)] hover:underline"
                >
                  Abrir fatura <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </dd>
            </div>
          )}
        </dl>

        {result.asaas.error && (
          <p className="mt-3 text-xs text-amber-700">
            Atenção: a cobrança no Asaas não pôde ser criada agora ({result.asaas.error}).
            A equipe PMB será notificada.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Link
            href="/painel/revendas"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            Ver minhas revendas
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null)
              router.refresh()
            }}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cadastrar outra
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="name" label="Nome da revenda" value={name} onChange={onName} error={fieldErrors.name} disabled={submitting} required />
        <Field
          id="slug"
          label="Endereço (slug)"
          value={slug}
          onChange={(v) => {
            setSlugTouched(true)
            setSlug(slugify(v))
          }}
          error={fieldErrors.slug}
          disabled={submitting}
          required
          mono
          hint="Vitrine: slug.livrecursos.com.br"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="ownerName" label="Nome do responsável" value={ownerName} onChange={setOwnerName} error={fieldErrors.ownerName} disabled={submitting} required />
        <Field id="ownerEmail" label="E-mail do responsável" type="email" value={ownerEmail} onChange={setOwnerEmail} error={fieldErrors.ownerEmail} disabled={submitting} required />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="ownerCpfCnpj" label="CPF/CNPJ" value={ownerCpfCnpj} onChange={setOwnerCpfCnpj} error={fieldErrors.ownerCpfCnpj} disabled={submitting} required mono />
        <Field id="ownerPhone" label="Telefone (opcional)" value={ownerPhone} onChange={setOwnerPhone} error={fieldErrors.ownerPhone} disabled={submitting} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id="planValue"
          label="Mensalidade (R$)"
          type="number"
          value={planValue}
          onChange={setPlanValue}
          error={fieldErrors.planValue}
          disabled={submitting}
          required
          mono
          hint="Valor que a PMB cobrará da nova revenda. 0 = cortesia."
        />
        <div className="space-y-2">
          <Label htmlFor="installments">Parcelas da 1ª mensalidade (cartão)</Label>
          <select
            id="installments"
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            disabled={submitting}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista" : `${n}x`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    {FIELD_LABEL[k] ?? k}: {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-[var(--color-pmb-lime-50)]/50 p-4 text-xs text-[var(--color-pmb-green-700)]">
        A cobrança da mensalidade é feita pela PMB (sistema mãe). A nova revenda fica
        atrelada a você e você passa a ganhar comissão de indicação recorrente.
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)] sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
          </>
        ) : (
          "Criar revenda"
        )}
      </Button>
    </form>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  error,
  disabled,
  required,
  mono,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
  disabled?: boolean
  required?: boolean
  mono?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className={mono ? "font-mono" : ""}
      />
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
