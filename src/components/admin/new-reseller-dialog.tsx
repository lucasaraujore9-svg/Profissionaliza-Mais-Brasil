"use client"

import { useState } from "react"
import {
  Copy,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Plus,
  Mail,
  CheckCircle2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface NewResellerDialogProps {
  onCreated: () => void
}

interface CreatedResult {
  tenant: { id: string; slug: string; name: string }
  owner: { id: string; email: string }
  tempPassword: string
  vitrineUrl: string
  asaas: {
    configured: boolean
    customerId: string | null
    subscriptionId: string | null
    invoiceUrl: string | null
    error: string | null
  }
  email: {
    configured: boolean
    sent: boolean
    error: string | null
  }
}

export function NewResellerDialog({ onCreated }: NewResellerDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedResult | null>(null)

  const reset = () => {
    setError(null)
    setCreated(null)
    setSubmitting(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
      ownerName: String(formData.get("ownerName") ?? "").trim(),
      ownerEmail: String(formData.get("ownerEmail") ?? "").trim().toLowerCase(),
      ownerCpfCnpj: String(formData.get("ownerCpfCnpj") ?? "").replace(/\D/g, ""),
      ownerPhone: String(formData.get("ownerPhone") ?? "").trim(),
      planValue: Number(formData.get("planValue") ?? 0),
    }

    try {
      const res = await fetch("/api/admin/revendedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        const fields = body.fields as
          | Record<string, string[] | undefined>
          | undefined
        const firstField =
          fields && Object.values(fields).find((arr) => arr && arr.length)
        setError(firstField?.[0] ?? body.error ?? "Erro ao criar revenda")
        return
      }
      setCreated(body.data as CreatedResult)
      onCreated()
    } catch {
      setError("Erro de rede ao criar revenda")
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => {
    setOpen(false)
    setTimeout(reset, 250)
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Nova revenda
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          {!created ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Cadastrar revenda</DialogTitle>
                <DialogDescription>
                  A revenda fica em <strong>aguardando pagamento</strong> até a
                  primeira mensalidade ser confirmada.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="r-name">Nome da revenda</Label>
                  <Input
                    id="r-name"
                    name="name"
                    required
                    placeholder="Ex: Cursos da Maria"
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="r-slug">
                    Subdomínio{" "}
                    <span className="font-normal text-gray-500">
                      (.profissionalizamaisbrasil.com.br)
                    </span>
                  </Label>
                  <Input
                    id="r-slug"
                    name="slug"
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?"
                    placeholder="cursosdamaria"
                    className="mt-1.5 lowercase"
                  />
                </div>
                <div>
                  <Label htmlFor="r-owner-name">Responsável</Label>
                  <Input
                    id="r-owner-name"
                    name="ownerName"
                    required
                    className="mt-1.5"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label htmlFor="r-owner-email">Email do responsável</Label>
                  <Input
                    id="r-owner-email"
                    name="ownerEmail"
                    type="email"
                    required
                    className="mt-1.5"
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <Label htmlFor="r-cpf">CPF/CNPJ</Label>
                  <Input
                    id="r-cpf"
                    name="ownerCpfCnpj"
                    required
                    minLength={11}
                    className="mt-1.5"
                    placeholder="Apenas números"
                  />
                </div>
                <div>
                  <Label htmlFor="r-phone">Celular</Label>
                  <Input
                    id="r-phone"
                    name="ownerPhone"
                    className="mt-1.5"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="r-plan">Mensalidade (R$)</Label>
                  <Input
                    id="r-plan"
                    name="planValue"
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    defaultValue={99.9}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar e gerar link de pagamento"
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <CreatedSuccess result={created} onClose={close} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CreatedSuccess({
  result,
  onClose,
}: {
  result: CreatedResult
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Revenda criada — aguardando pagamento</DialogTitle>
        <DialogDescription>
          {result.email.sent
            ? `Enviamos as instruções por email para ${result.owner.email}.`
            : "Envie manualmente os dados abaixo para o responsável."}
        </DialogDescription>
      </DialogHeader>

      {result.email.sent ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>Email enviado</strong> para{" "}
            <strong>{result.owner.email}</strong> com credenciais de acesso e
            link de pagamento. O responsável pode finalizar tudo a partir do
            email.
          </p>
        </div>
      ) : result.email.configured ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Falha ao enviar email automático. Copie os dados abaixo e envie
            manualmente.
            {result.email.error && ` (${result.email.error})`}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>RESEND_API_KEY não configurada.</strong> Email não foi
            enviado. Copie os dados abaixo e envie manualmente.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-sm">
        <Field
          label="Email do admin da revenda"
          value={result.owner.email}
          onCopy={() => copy("email", result.owner.email)}
          copied={copied === "email"}
        />
        <Field
          label="Senha temporária"
          value={result.tempPassword}
          onCopy={() => copy("senha", result.tempPassword)}
          copied={copied === "senha"}
          mono
        />
        <Field
          label="Vitrine"
          value={`https://${result.tenant.slug}.profissionalizamaisbrasil.com.br`}
          onCopy={() =>
            copy(
              "url",
              `https://${result.tenant.slug}.profissionalizamaisbrasil.com.br`,
            )
          }
          copied={copied === "url"}
        />
      </div>

      {result.asaas.configured ? (
        result.asaas.invoiceUrl ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-900">
              Link de pagamento da primeira mensalidade
            </p>
            <a
              href={result.asaas.invoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 break-all text-emerald-800 underline underline-offset-2"
            >
              {result.asaas.invoiceUrl}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => copy("invoice", result.asaas.invoiceUrl!)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
            >
              <Copy className="h-3 w-3" />
              {copied === "invoice" ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
            Subscription criada no Asaas, mas o link da primeira fatura ainda
            não foi gerado. Em alguns minutos o webhook PAYMENT_CREATED vai
            popular o invoiceUrl.
            {result.asaas.error && ` (${result.asaas.error})`}
          </div>
        )
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          ASAAS_API_KEY não configurada. A revenda foi criada como{" "}
          <strong>PENDING</strong>. Para gerar cobrança automática, configure
          a chave Asaas no Vercel.
        </div>
      )}

      <DialogFooter>
        <Button onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </div>
  )
}

function Field({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
        <span
          className={`break-all text-[13px] text-gray-900 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  )
}
