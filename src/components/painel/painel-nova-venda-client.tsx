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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CourseOption {
  id: string
  nome: string
  price: number
  paymentType: "ONE_TIME" | "MONTHLY"
}

interface PackageOption {
  id: string
  name: string
  price: number
  courseCount: number
}

/**
 * Opção unificada do seletor de venda direta. O `value` codifica o tipo
 * (`c:` = curso, `p:` = pacote) para que curso e pacote coexistam num único
 * `<Select>` sem colisão de ids. Pacote é sempre pagamento único (ONE_TIME).
 */
type SaleOption = {
  value: string
  kind: "course" | "package"
  id: string
  label: string
  price: number
  paymentType: "ONE_TIME" | "MONTHLY"
  courseCount?: number
}

/** Capability de venda parcelada no boleto (só presente quando ativa). */
interface InstallmentConfig {
  /** Teto de parcelas que a unidade pode oferecer. */
  maxCount: number
  /** Gateway de venda da unidade — MP exige endereço do aluno no boleto. */
  gateway: "MP" | "ASAAS"
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Data de hoje + N dias em YYYY-MM-DD (para default e mínimo do input date). */
function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface CreatedVenda {
  enrollmentId: string
  /** Link da NOSSA página de pagamento transparente (não é o site do MP). */
  paymentUrl?: string
  basePrice?: number
  finalAmount: number
  discountAmount?: number
  scholarship?: boolean
  /** Presente quando a venda é um carnê (parcelado no boleto). */
  installment?: {
    count: number
    installmentValue: number
    total: number
    firstBoletoUrl: string | null
  }
}

export function PainelNovaVendaClient({
  courses,
  packages,
  installmentConfig,
}: {
  courses: CourseOption[]
  packages: PackageOption[]
  installmentConfig: InstallmentConfig | null
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<CreatedVenda | null>(null)
  const [copied, setCopied] = useState(false)

  // Opções unificadas: cursos primeiro, depois pacotes. O value codifica o tipo.
  const courseOptions: SaleOption[] = courses.map((c) => ({
    value: `c:${c.id}`,
    kind: "course",
    id: c.id,
    label: `${c.nome} — ${formatBRL(c.price)}${c.paymentType === "MONTHLY" ? "/mês" : ""}`,
    price: c.price,
    paymentType: c.paymentType,
  }))
  const packageOptions: SaleOption[] = packages.map((p) => ({
    value: `p:${p.id}`,
    kind: "package",
    id: p.id,
    label: `Pacote: ${p.name} — ${formatBRL(p.price)}`,
    price: p.price,
    paymentType: "ONE_TIME",
    courseCount: p.courseCount,
  }))

  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    fone: "",
    // Value codificado da opção selecionada (`c:<id>` ou `p:<id>`).
    selection: "",
    couponCode: "",
    bolsista: false,
  })

  // Modo de pagamento: "normal" (link comum) vs "installment" (carnê no boleto).
  const [paymentMode, setPaymentMode] = useState<"normal" | "installment">("normal")
  const [inst, setInst] = useState({
    count: 2,
    value: "",
    firstDueDate: isoDatePlusDays(7),
  })
  const [addr, setAddr] = useState({
    cep: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
  })

  const selected =
    [...courseOptions, ...packageOptions].find(
      (o) => o.value === form.selection,
    ) ?? null
  const isPackage = selected?.kind === "package"

  const installmentAvailable = !!installmentConfig && !form.bolsista
  const isInstallment = installmentAvailable && paymentMode === "installment"
  const needsAddress = isInstallment && installmentConfig?.gateway === "MP"
  const installmentValueNum = Number(inst.value.replace(",", ".")) || 0
  const installmentTotal =
    Math.round(installmentValueNum * inst.count * 100) / 100

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
          // Curso individual envia tenantCourseId; pacote envia packageId.
          ...(isPackage
            ? { packageId: selected?.id }
            : { tenantCourseId: selected?.id ?? "" }),
          // Cupom não se aplica a bolsa nem a carnê (valor definido manualmente).
          couponCode:
            form.bolsista || isInstallment
              ? undefined
              : form.couponCode.trim() || undefined,
          bolsista: form.bolsista || undefined,
          boletoInstallment: isInstallment
            ? {
                count: inst.count,
                installmentValue: installmentValueNum,
                firstDueDate: inst.firstDueDate,
              }
            : undefined,
          endereco: needsAddress
            ? {
                cep: addr.cep.replace(/\D/g, ""),
                rua: addr.rua.trim(),
                numero: addr.numero.trim(),
                bairro: addr.bairro.trim(),
                cidade: addr.cidade.trim(),
                estado: addr.estado.trim().toUpperCase(),
              }
            : undefined,
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
    const link = created?.installment?.firstBoletoUrl ?? created?.paymentUrl
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (created) {
    return (
      <div className="space-y-5">
        {created.scholarship ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h2 className="text-base font-bold">Bolsa de estudo concedida</h2>
            <p className="mt-2 text-sm">
              O aluno foi matriculado na plataforma de aulas{" "}
              <strong>sem cobrança</strong>. As credenciais de acesso foram
              enviadas para o e-mail informado.
            </p>
          </div>
        ) : created.installment ? (
          <div className="rounded-2xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-6 text-[var(--color-pmb-green-900)]">
            <h2 className="text-base font-bold">
              Carnê gerado — {created.installment.count}x de{" "}
              {formatBRL(created.installment.installmentValue)}
            </h2>
            <p className="mt-2 text-sm">
              O aluno acessa cada boleto na área dele. A{" "}
              <strong>1ª parcela</strong> já está disponível; as próximas ficam
              disponíveis <strong>7 dias antes de cada vencimento</strong>. O
              acesso ao curso é liberado quando a 1ª parcela for paga.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Mini
                label="Parcelas"
                value={`${created.installment.count}x`}
              />
              <Mini
                label="Cada parcela"
                value={formatBRL(created.installment.installmentValue)}
              />
              <Mini
                label="Total"
                value={formatBRL(created.installment.total)}
                accent
              />
            </div>

            {created.installment.firstBoletoUrl && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={created.installment.firstBoletoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
                >
                  Abrir 1º boleto
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-pmb-green)]/30 bg-white px-4 py-2.5 text-xs font-bold text-[var(--color-pmb-green-700)] hover:bg-[var(--color-pmb-green)]/5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Link copiado" : "Copiar link do boleto"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-6 text-[var(--color-pmb-green-900)]">
            <h2 className="text-base font-bold">
              Venda criada — link de pagamento gerado
            </h2>
            <p className="mt-2 text-sm">
              Envie o link abaixo para o aluno finalizar o pagamento na sua
              própria loja (cartão, PIX ou boleto — sem sair do site). A
              matrícula é ativada automaticamente após a confirmação do
              pagamento.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Mini label="Original" value={formatBRL(created.basePrice ?? 0)} />
              <Mini
                label="Desconto"
                value={formatBRL(created.discountAmount ?? 0)}
              />
              <Mini label="Final" value={formatBRL(created.finalAmount)} accent />
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
              setPaymentMode("normal")
              setInst({ count: 2, value: "", firstDueDate: isoDatePlusDays(7) })
              setAddr({
                cep: "",
                rua: "",
                numero: "",
                bairro: "",
                cidade: "",
                estado: "",
              })
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
            <Label htmlFor="v-curso">Curso ou pacote da sua vitrine</Label>
            <Select
              value={form.selection}
              onValueChange={(v) => setForm({ ...form, selection: v ?? "" })}
            >
              <SelectTrigger
                id="v-curso"
                className="mt-1.5 h-10 w-full"
                aria-invalid={
                  !!fieldErrors.tenantCourseId || !!fieldErrors.packageId
                }
              >
                {/* Função-filho: o Base UI resolve o rótulo a partir do value
                    codificado — sem isso o gatilho mostraria o id cru. */}
                <SelectValue placeholder="Selecione um curso ou pacote…">
                  {(value) =>
                    [...courseOptions, ...packageOptions].find(
                      (o) => o.value === value,
                    )?.label ?? "Selecione um curso ou pacote…"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {courseOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Cursos</SelectLabel>
                    {courseOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {packageOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Pacotes</SelectLabel>
                    {packageOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {(fieldErrors.tenantCourseId || fieldErrors.packageId) && (
              <p className="mt-1 text-xs text-rose-600">
                {fieldErrors.tenantCourseId ?? fieldErrors.packageId}
              </p>
            )}
            {selected && !isInstallment && (
              <p className="mt-1.5 text-xs text-gray-500">
                {isPackage
                  ? `Pacote • ${selected.courseCount} ${selected.courseCount === 1 ? "curso" : "cursos"} • Pagamento único`
                  : `Tipo: ${selected.paymentType === "MONTHLY" ? "Mensalidade recorrente" : "Pagamento único"}`}
              </p>
            )}
          </div>
          {!isInstallment && (
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
          )}
        </div>

        {/* Modo de pagamento (só quando a unidade tem carnê liberado) */}
        {installmentAvailable && (
          <div className="mt-4">
            <span className="text-xs font-semibold text-gray-600">
              Forma de pagamento
            </span>
            <div className="mt-1.5 inline-flex rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => setPaymentMode("normal")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  paymentMode === "normal"
                    ? "bg-[var(--color-pmb-green)] text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Link de pagamento
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode("installment")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  paymentMode === "installment"
                    ? "bg-[var(--color-pmb-green)] text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Parcelado no boleto (carnê)
              </button>
            </div>
          </div>
        )}

        {/* Campos do carnê */}
        {isInstallment && installmentConfig && (
          <div className="mt-4 grid gap-3 rounded-xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="v-parcelas">Nº de parcelas</Label>
              <Select
                value={String(inst.count)}
                onValueChange={(v) =>
                  setInst({ ...inst, count: Number(v) || 2 })
                }
              >
                <SelectTrigger id="v-parcelas" className="mt-1.5 h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    { length: Math.max(0, installmentConfig.maxCount - 1) },
                    (_, i) => i + 2,
                  ).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors["boletoInstallment.count"] && (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors["boletoInstallment.count"]}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="v-parcela-valor">Valor de cada parcela</Label>
              <Input
                id="v-parcela-valor"
                inputMode="decimal"
                value={inst.value}
                onChange={(e) => setInst({ ...inst, value: e.target.value })}
                placeholder="Ex: 89,90"
                className="mt-1.5"
                required
              />
              {fieldErrors["boletoInstallment.installmentValue"] && (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors["boletoInstallment.installmentValue"]}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="v-parcela-venc">1º vencimento</Label>
              <Input
                id="v-parcela-venc"
                type="date"
                value={inst.firstDueDate}
                min={isoDatePlusDays(1)}
                onChange={(e) =>
                  setInst({ ...inst, firstDueDate: e.target.value })
                }
                className="mt-1.5"
                required
              />
              {fieldErrors["boletoInstallment.firstDueDate"] && (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors["boletoInstallment.firstDueDate"]}
                </p>
              )}
            </div>
            <p className="sm:col-span-3 text-xs text-gray-600">
              A 1ª parcela fica disponível na hora; as próximas, 7 dias antes de
              cada vencimento, na área do aluno. O acesso é liberado quando a 1ª
              parcela for paga.
            </p>
          </div>
        )}

        {/* Endereço do aluno — exigido pelo Mercado Pago para emitir o boleto */}
        {needsAddress && (
          <div className="mt-4">
            <h4 className="text-xs font-bold text-[var(--color-pmb-green-900)]">
              Endereço do aluno (para o boleto)
            </h4>
            <div className="mt-2 grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label htmlFor="v-cep">CEP</Label>
                <Input
                  id="v-cep"
                  value={addr.cep}
                  onChange={(e) => setAddr({ ...addr, cep: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="v-rua">Logradouro</Label>
                <Input
                  id="v-rua"
                  value={addr.rua}
                  onChange={(e) => setAddr({ ...addr, rua: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="v-numero">Número</Label>
                <Input
                  id="v-numero"
                  value={addr.numero}
                  onChange={(e) => setAddr({ ...addr, numero: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="v-bairro">Bairro</Label>
                <Input
                  id="v-bairro"
                  value={addr.bairro}
                  onChange={(e) => setAddr({ ...addr, bairro: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="v-cidade">Cidade</Label>
                <Input
                  id="v-cidade"
                  value={addr.cidade}
                  onChange={(e) => setAddr({ ...addr, cidade: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="v-uf">UF</Label>
                <Input
                  id="v-uf"
                  value={addr.estado}
                  maxLength={2}
                  onChange={(e) => setAddr({ ...addr, estado: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
            </div>
          </div>
        )}

        <label
          data-tour="vendas-nova:bolsista"
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <input
            type="checkbox"
            checked={form.bolsista}
            onChange={(e) => {
              const checked = e.target.checked
              setForm({ ...form, bolsista: checked })
              if (checked) setPaymentMode("normal")
            }}
            className="mt-0.5 h-4 w-4 accent-amber-600"
          />
          <span className="text-sm">
            <span className="font-semibold text-amber-900">
              Bolsista (bolsa de estudo)
            </span>
            <span className="mt-0.5 block text-xs text-amber-700">
              Matricula o aluno na plataforma de aulas{" "}
              <strong>sem gerar cobrança</strong>. Nenhum link/boleto é criado.
            </span>
          </span>
        </label>
      </div>

      {selected && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
            Resumo do pedido
          </h3>
          {isInstallment ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-600">Parcelas</dt>
                <dd className="font-mono text-gray-900">
                  {inst.count}x de {formatBRL(installmentValueNum)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                <dt className="font-semibold text-[var(--color-pmb-green-900)]">
                  Total do carnê
                </dt>
                <dd className="font-mono text-base font-bold text-[var(--color-pmb-green-700)]">
                  {formatBRL(installmentTotal)}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-600">Valor original</dt>
                <dd className="font-mono text-gray-900">
                  {formatBRL(selected.price)}
                  {selected.paymentType === "MONTHLY" ? "/mês" : ""}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-600">
                  {form.bolsista ? "Bolsa de estudo" : "Cupom"}
                </dt>
                <dd className="font-mono text-gray-900">
                  {form.bolsista
                    ? `- ${formatBRL(selected.price)}`
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
                      ? `até ${formatBRL(selected.price)}`
                      : formatBRL(selected.price)}
                  {!form.bolsista && selected.paymentType === "MONTHLY"
                    ? "/mês"
                    : ""}
                </dd>
              </div>
            </dl>
          )}
          {!form.bolsista && !isInstallment && form.couponCode.trim() && (
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
              {form.bolsista
                ? "Concedendo bolsa..."
                : isInstallment
                  ? "Gerando carnê..."
                  : "Gerando link..."}
            </>
          ) : form.bolsista ? (
            "Conceder bolsa de estudo"
          ) : isInstallment ? (
            "Gerar carnê no boleto"
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
