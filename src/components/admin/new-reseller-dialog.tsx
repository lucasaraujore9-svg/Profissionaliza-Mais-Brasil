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
import { appDomain, vitrineDomain, vitrineUrl as buildVitrineUrl } from "@/lib/tenant/urls"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"

/**
 * Sugestao de subdomínio a partir do nome da unidade: sem acento, minúsculo,
 * só [a-z0-9] (ex.: "Escola do João" -> "escoladojoao"). O campo continua
 * editável; isto apenas pré-preenche.
 */
function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32)
}

interface NewResellerDialogProps {
  onCreated: () => void
  /** Pré-preenche os campos (usado na conversão de um lead em revenda). */
  initialValues?: {
    name?: string
    ownerName?: string
    ownerEmail?: string
    ownerPhone?: string
  }
  /** Quando presente, vincula a criação ao lead (atribui referrer + marca CONVERTED). */
  leadId?: string
  /** Texto do botão de abertura. Padrão: "Nova revenda". */
  triggerLabel?: string
  /** Estilo alternativo do gatilho (compacto, p/ lista de leads). */
  triggerVariant?: "primary" | "outline"
}

interface CreatedResult {
  tenant: { id: string; slug: string; name: string }
  owner: { id: string; email: string }
  tempPassword: string | null
  vitrineUrl: string
  asaas: {
    configured: boolean
    customerId: string | null
    subscriptionId: string | null
    promoSubscriptionId: string | null
    free: boolean
    invoiceUrl: string | null
    firstPaymentId: string | null
    error: string | null
  }
  email: {
    configured: boolean
    sent: boolean
    error: string | null
  }
}

export function NewResellerDialog({
  onCreated,
  initialValues,
  leadId,
  triggerLabel = "Nova revenda",
  triggerVariant = "primary",
}: NewResellerDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedResult | null>(null)
  // Mensalidade controlada para alternar copy/promoção conforme o valor.
  const [planValueStr, setPlanValueStr] = useState("239.00")
  const [promoEnabled, setPromoEnabled] = useState(false)
  // Nome + subdomínio controlados: o subdomínio é sugerido a partir do nome
  // até o admin editá-lo manualmente (slugTouched).
  const [name, setName] = useState(initialValues?.name ?? "")
  const [slug, setSlug] = useState(suggestSlug(initialValues?.name ?? ""))
  const [slugTouched, setSlugTouched] = useState(false)
  // Máximo de parcelas no cartão para a PRIMEIRA mensalidade (1 = à vista).
  const [maxInstallments, setMaxInstallments] = useState(1)

  const planValueNum = Number(planValueStr.replace(",", "."))
  const isFree = planValueStr.trim() !== "" && planValueNum === 0

  const reset = () => {
    setError(null)
    setCreated(null)
    setSubmitting(false)
    setPlanValueStr("239.00")
    setPromoEnabled(false)
    setName(initialValues?.name ?? "")
    setSlug(suggestSlug(initialValues?.name ?? ""))
    setSlugTouched(false)
    setMaxInstallments(1)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const planValue = Number(
      String(formData.get("planValue") ?? "0").replace(",", "."),
    )
    const cleanName = name.trim()
    const cleanSlug = slug.trim().toLowerCase()

    // Marca reservada (contrato) — feedback imediato; o servidor revalida.
    const forbidden = forbiddenNameError(cleanName) ?? forbiddenNameError(cleanSlug)
    if (forbidden) {
      setError(forbidden)
      setSubmitting(false)
      return
    }

    const usePromo = promoEnabled && planValue > 0
    const payload = {
      name: cleanName,
      slug: cleanSlug,
      ownerName: String(formData.get("ownerName") ?? "").trim(),
      ownerEmail: String(formData.get("ownerEmail") ?? "").trim().toLowerCase(),
      ownerCpfCnpj: String(formData.get("ownerCpfCnpj") ?? "").replace(/\D/g, ""),
      ownerPhone: String(formData.get("ownerPhone") ?? "").trim(),
      planValue,
      // Parcelamento da 1ª mensalidade só faz sentido em revenda paga.
      firstPaymentMaxInstallments: planValue > 0 ? maxInstallments : 1,
      ...(usePromo
        ? {
            promoMonths: Number(formData.get("promoMonths") ?? 0),
            promoValue: Number(
              String(formData.get("promoValue") ?? "0").replace(",", "."),
            ),
          }
        : {}),
      ...(leadId ? { leadId } : {}),
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
      // NÃO avisa o pai aqui: o callback dispara router.refresh(), que
      // re-renderiza a lista/kanban com o lead já CONVERTED e desmonta este
      // dialog — apagando a tela de sucesso antes do admin copiar o link de
      // pagamento. O refresh é adiado para o fechamento (ver `close`).
    } catch {
      setError("Erro de rede ao criar revenda")
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => {
    setOpen(false)
    // Avisa o pai só agora (refresh da lista/kanban). Se feito na criação, o
    // refresh desmontaria este dialog e a tela de sucesso sumiria antes do
    // admin copiar o link de pagamento.
    if (created) onCreated()
    setTimeout(reset, 250)
  }

  return (
    <>
      {triggerVariant === "outline" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {triggerLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          {!created ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Cadastrar revenda</DialogTitle>
                <DialogDescription>
                  {isFree ? (
                    <>
                      Mensalidade <strong>R$ 0</strong>: a revenda fica{" "}
                      <strong>ativa na hora</strong>, sem cobrança. Você pode
                      ligar a cobrança depois na página da revenda.
                    </>
                  ) : promoEnabled ? (
                    <>
                      As primeiras mensalidades saem no{" "}
                      <strong>valor promocional</strong>; depois a cobrança volta
                      ao valor cheio. Fica em <strong>aguardando pagamento</strong>{" "}
                      até a 1ª ser confirmada.
                    </>
                  ) : (
                    <>
                      A revenda fica em <strong>aguardando pagamento</strong> até a
                      primeira mensalidade ser confirmada.
                    </>
                  )}
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
                    value={name}
                    onChange={(e) => {
                      const next = e.target.value
                      setName(next)
                      // Sugere o subdomínio até o admin editá-lo manualmente.
                      if (!slugTouched) setSlug(suggestSlug(next))
                    }}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="r-slug">
                    Subdomínio{" "}
                    <span className="font-normal text-gray-500">
                      (.{vitrineDomain()})
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
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setSlug(e.target.value.toLowerCase())
                    }}
                    className="mt-1.5 lowercase"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Preenchido a partir do nome — você pode editar.
                  </p>
                </div>
                <div>
                  <Label htmlFor="r-owner-name">Responsável</Label>
                  <Input
                    id="r-owner-name"
                    name="ownerName"
                    required
                    className="mt-1.5"
                    placeholder="Nome completo"
                    defaultValue={initialValues?.ownerName ?? ""}
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
                    defaultValue={initialValues?.ownerEmail ?? ""}
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
                    defaultValue={initialValues?.ownerPhone ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="r-plan">
                    Mensalidade (R$){" "}
                    <span className="font-normal text-gray-500">
                      (0 = revenda gratuita)
                    </span>
                  </Label>
                  <Input
                    id="r-plan"
                    name="planValue"
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={planValueStr}
                    onChange={(e) => setPlanValueStr(e.target.value)}
                    className="mt-1.5"
                  />
                </div>

                {/* Parcelamento da PRIMEIRA mensalidade no cartão de crédito.
                    O revendedor escolhe, no checkout, de 1x até este limite. */}
                {!isFree && (
                  <div className="sm:col-span-2">
                    <Label htmlFor="r-installments">
                      Parcelamento da 1ª mensalidade no cartão{" "}
                      <span className="font-normal text-gray-500">
                        (limite que a revenda poderá escolher)
                      </span>
                    </Label>
                    <select
                      id="r-installments"
                      value={maxInstallments}
                      onChange={(e) => setMaxInstallments(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)]"
                    >
                      <option value={1}>À vista (sem parcelamento)</option>
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          Até {n}x
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">
                      Vale só para a 1ª mensalidade e só no cartão. As mensalidades
                      seguintes continuam mensais no valor cheio.
                    </p>
                  </div>
                )}

                {/* Promoção: as N primeiras mensalidades num valor reduzido */}
                {!isFree && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={promoEnabled}
                        onChange={(e) => setPromoEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Mensalidade promocional nas primeiras parcelas
                    </label>
                    {promoEnabled && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="r-promo-months">
                            Nº de meses na promoção
                          </Label>
                          <Input
                            id="r-promo-months"
                            name="promoMonths"
                            type="number"
                            min={1}
                            max={24}
                            step={1}
                            required={promoEnabled}
                            defaultValue={3}
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="r-promo-value">Valor promocional (R$)</Label>
                          <Input
                            id="r-promo-value"
                            name="promoValue"
                            type="number"
                            min={0}
                            step="0.01"
                            required={promoEnabled}
                            placeholder="Ex: 49.90"
                            className="mt-1.5"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 sm:col-span-2">
                          As primeiras parcelas saem no valor promocional; a partir
                          daí volta à mensalidade cheia acima.
                        </p>
                      </div>
                    )}
                  </div>
                )}
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

  // Link de pagamento: prefere nossa página interna, cai no externo se não tiver ID
  const paymentLink = result.asaas.firstPaymentId
    ? `/cobranca/${result.asaas.firstPaymentId}`
    : result.asaas.invoiceUrl

  const vitrineUrl = buildVitrineUrl(result.tenant.slug)

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Revenda criada com sucesso</DialogTitle>
        <DialogDescription>
          Copie as credenciais abaixo e envie ao responsável.
          {result.email.sent && ` Um email também foi enviado para ${result.owner.email}.`}
        </DialogDescription>
      </DialogHeader>

      {/* Credenciais — sempre exibidas em destaque */}
      <div className="rounded-xl border-2 border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-pmb-green-900)]">
          Credenciais de acesso inicial
        </p>
        <div className="space-y-2.5">
          <Field
            label="Email"
            value={result.owner.email}
            onCopy={() => copy("email", result.owner.email)}
            copied={copied === "email"}
          />
          {result.tempPassword ? (
            <Field
              label="Senha inicial (trocar no primeiro acesso)"
              value={result.tempPassword}
              onCopy={() => copy("senha", result.tempPassword ?? "")}
              copied={copied === "senha"}
              mono
              highlight
            />
          ) : (
            <p className="rounded-lg bg-[var(--color-pmb-green)]/10 px-3 py-2 text-xs text-[var(--color-pmb-green-900)]">
              Senha inicial enviada por e-mail para <strong>{result.owner.email}</strong>.
              Caso não receba, o revendedor pode usar &ldquo;Esqueci minha senha&rdquo; na tela de login.
            </p>
          )}
          <Field
            label="Vitrine"
            value={vitrineUrl}
            onCopy={() => copy("url", vitrineUrl)}
            copied={copied === "url"}
          />
        </div>
      </div>

      {/* Status do email */}
      {result.email.sent ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Email de boas-vindas enviado para {result.owner.email}.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Email não enviado.{result.email.error ? ` (${result.email.error})` : ""}{" "}
            Envie as credenciais acima manualmente.
          </span>
        </div>
      )}

      {/* Revenda gratuita — sem cobrança */}
      {result.asaas.free ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Revenda <strong>gratuita</strong> e já ativa — nenhuma cobrança foi
            criada. Você pode ligar a mensalidade depois na página da revenda.
          </span>
        </div>
      ) : paymentLink ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-gray-700">
            Link da primeira mensalidade
          </p>
          <div className="flex items-center gap-2">
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center gap-1 truncate text-xs text-[var(--color-pmb-green)] underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{paymentLink.startsWith("/") ? `${appDomain()}${paymentLink}` : paymentLink}</span>
            </a>
            <button
              type="button"
              onClick={() => copy("invoice", paymentLink.startsWith("/")
                ? `${typeof window !== "undefined" ? window.location.origin : ""}${paymentLink}`
                : paymentLink
              )}
              className="shrink-0 rounded bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-300"
            >
              {copied === "invoice" ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      ) : result.asaas.configured && !result.asaas.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          Link de pagamento ainda sendo gerado. Acesse a revenda em instantes para copiar.
        </div>
      ) : result.asaas.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          Cobrança automática não configurada: {result.asaas.error}. Configure na página da revenda.
        </div>
      ) : null}

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
  highlight,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  mono?: boolean
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500">{label}</p>
      <div
        className={`mt-1 flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
          highlight
            ? "border-[var(--color-pmb-green)]/30 bg-white ring-1 ring-[var(--color-pmb-green)]/20"
            : "border-gray-200 bg-white"
        }`}
      >
        <span
          className={`break-all text-[13px] text-gray-900 ${mono ? "font-mono tracking-wider" : ""}`}
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
