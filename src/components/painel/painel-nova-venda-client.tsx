"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react"
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
import { MAX_SALE_COURSES } from "@/lib/enrollment/multi-course"

// ─── Types ────────────────────────────────────────────────────────────────────

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
 * Item unificado do seletor (curso ou pacote). Pacote é sempre pagamento único.
 * O `kind` roteia o corpo da venda: tenantCourseId vs packageId.
 */
type SaleItem = {
  kind: "course" | "package"
  id: string
  nome: string
  preco: number
  paymentType: "ONE_TIME" | "MONTHLY"
  courseCount?: number
}

/** Aluno vindo da busca (alunos da própria unidade). */
interface StudentResult {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
}

/**
 * Aluno selecionado para a venda: OU um aluno já existente da unidade
 * (isNew=false, carrega o id) OU um aluno novo digitado na hora (isNew=true,
 * ainda não persistido — o backend cria/reaproveita por CPF no submit).
 */
type SelectedStudent =
  | { isNew: false; id: string; nome: string; email: string | null; cpf: string | null; fone: string | null }
  | { isNew: true; nome: string; email: string; cpf: string; fone: string }

/** Capability de venda parcelada no boleto (só presente quando ativa). */
interface InstallmentConfig {
  /** Teto de parcelas que a unidade pode oferecer. */
  maxCount: number
  /** Gateway de venda da unidade — MP exige endereço do aluno no boleto. */
  gateway: "MP" | "ASAAS"
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function validateCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r = (s * 10) % 11
  if (r >= 10) r = 0
  if (r !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  r = (s * 10) % 11
  if (r >= 10) r = 0
  return r === +d[10]
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Data de hoje + N dias em YYYY-MM-DD (para default e mínimo do input date). */
function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PainelNovaVendaClient({
  cap,
  gateway,
  courses,
  packages,
  installmentConfig,
}: {
  /** Cap de desconto (%) do vendedor logado: dono 100, consultor = maxDiscount. */
  cap: number
  /** Gateway de venda da unidade (rótulo/carnê). Venda normal é sempre MP. */
  gateway: "MP" | "ASAAS"
  courses: CourseOption[]
  packages: PackageOption[]
  installmentConfig: InstallmentConfig | null
}) {
  // Lista unificada: cursos primeiro, depois pacotes (prefixados "Pacote:").
  const items: SaleItem[] = [
    ...courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      nome: c.nome,
      preco: c.price,
      paymentType: c.paymentType,
    })),
    ...packages.map((p) => ({
      kind: "package" as const,
      id: p.id,
      nome: `Pacote: ${p.name}`,
      preco: p.price,
      paymentType: "ONE_TIME" as const,
      courseCount: p.courseCount,
    })),
  ]

  // ── Bolsa de estudo (sem cobrança) ──
  const [bolsista, setBolsista] = useState(false)

  // ── Step 1 — Aluno ──
  const [studentTab, setStudentTab] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StudentResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null)
  const [newStudent, setNewStudent] = useState({ nome: "", email: "", cpf: "", fone: "" })
  const [studentErrors, setStudentErrors] = useState<Record<string, string>>({})
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Step 2 — Curso(s) ou pacote ──
  // A venda aceita VÁRIOS cursos (uma cobrança só, pela soma dos preços) ou UM
  // pacote — nunca a mistura dos dois.
  const [courseSearch, setCourseSearch] = useState("")
  const [selectedItems, setSelectedItems] = useState<SaleItem[]>([])
  const isPkg = selectedItems[0]?.kind === "package"
  const hasSelection = selectedItems.length > 0
  const isMulti = selectedItems.length > 1
  // Curso mensal é contrato recorrente de UM curso: o servidor recusa somá-lo a
  // outros, então a tela nem deixa marcar.
  const hasMonthly = selectedItems.some(
    (i) => i.kind === "course" && i.paymentType === "MONTHLY",
  )

  function isSelected(item: SaleItem): boolean {
    return selectedItems.some((i) => i.kind === item.kind && i.id === item.id)
  }

  /** Motivo de o item não poder entrar na seleção atual — null = pode. */
  function blockedReason(item: SaleItem): string | null {
    if (isSelected(item) || item.kind === "package") return null
    if (!hasSelection || isPkg) return null
    if (hasMonthly) return "o curso mensal é vendido sozinho"
    if (item.paymentType === "MONTHLY") return "curso mensal — vendido sozinho"
    if (selectedItems.length >= MAX_SALE_COURSES)
      return `máximo de ${MAX_SALE_COURSES} cursos por venda`
    return null
  }

  function toggleItem(item: SaleItem) {
    setSelectedItems((prev) => {
      // Pacote é a venda inteira: substitui tudo (ou desmarca).
      if (item.kind === "package") {
        const same = prev.length === 1 && prev[0].kind === "package" && prev[0].id === item.id
        return same ? [] : [item]
      }
      // Escolher um curso descarta um pacote que estivesse selecionado.
      const courses = prev.filter((i) => i.kind === "course")
      if (courses.some((i) => i.id === item.id)) {
        return courses.filter((i) => i.id !== item.id)
      }
      return [...courses, item]
    })
  }

  // ── Step 3 — Desconto (manual OU cupom, nunca os dois) ──
  const [couponCode, setCouponCode] = useState("")
  const [manualPct, setManualPct] = useState("")

  // ── Forma de pagamento: link normal vs carnê (parcelado no boleto) ──
  const [paymentMode, setPaymentMode] = useState<"normal" | "installment">("normal")
  const [inst, setInst] = useState({ count: 2, value: "", firstDueDate: isoDatePlusDays(7) })
  const [addr, setAddr] = useState({ cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "" })

  // ── Submit / resultado ──
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<CreatedVenda | null>(null)
  const [copied, setCopied] = useState(false)

  const installmentAvailable = !!installmentConfig && !bolsista
  const isInstallment = installmentAvailable && paymentMode === "installment"
  const needsAddress = isInstallment && installmentConfig?.gateway === "MP"
  const installmentValueNum = Number(inst.value.replace(",", ".")) || 0
  const installmentTotal = Math.round(installmentValueNum * inst.count * 100) / 100

  // Desconto manual derivado do input (aceita vírgula BR). Válido quando está
  // entre 0 (exclusivo) e o cap do vendedor; acima do cap o form bloqueia.
  const manualPctNumber = manualPct.trim() === "" ? 0 : Number(manualPct.replace(",", "."))
  const manualValid = Number.isFinite(manualPctNumber) && manualPctNumber > 0 && manualPctNumber <= cap
  // Preço base da venda: a SOMA dos itens selecionados (um pacote sempre está
  // sozinho, então a soma é o preço dele).
  const basePrice =
    Math.round(selectedItems.reduce((sum, i) => sum + i.preco, 0) * 100) / 100
  const manualDiscountAmount =
    manualValid && hasSelection
      ? Number(((basePrice * manualPctNumber) / 100).toFixed(2))
      : 0

  // Busca de alunos (debounced) — restrita aos alunos da própria unidade.
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/painel/alunos?q=${encodeURIComponent(query)}`)
        const body = await res.json()
        setSearchResults(body.data?.students ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [query])

  // Troca da seleção de cursos zera desconto e link (o total muda).
  useEffect(() => {
    setCouponCode("")
    setManualPct("")
    setCreated(null)
  }, [selectedItems])

  // Troca de aluno zera link.
  useEffect(() => {
    setCreated(null)
  }, [selectedStudent])

  // Ao ativar a bolsa, zera desconto e volta para o modo normal (bolsa não gera
  // cobrança nem carnê).
  useEffect(() => {
    setCreated(null)
    if (bolsista) {
      setCouponCode("")
      setManualPct("")
      setPaymentMode("normal")
    }
  }, [bolsista])

  function handleCpfChange(v: string) {
    setNewStudent((s) => ({ ...s, cpf: maskCpf(v) }))
    setStudentErrors((e) => ({ ...e, cpf: "" }))
  }

  function validateNewStudent(): boolean {
    const errors: Record<string, string> = {}
    if (!newStudent.nome.trim() || newStudent.nome.trim().length < 3)
      errors.nome = "Nome precisa ter pelo menos 3 caracteres"
    if (!validateEmail(newStudent.email)) errors.email = "E-mail inválido"
    if (!validateCpf(newStudent.cpf)) errors.cpf = "CPF inválido"
    if (newStudent.fone.replace(/\D/g, "").length < 10) errors.fone = "Telefone inválido"
    setStudentErrors(errors)
    return Object.keys(errors).length === 0
  }

  function confirmNewStudent() {
    if (!validateNewStudent()) return
    setSelectedStudent({
      isNew: true,
      nome: newStudent.nome.trim(),
      email: newStudent.email.trim(),
      cpf: newStudent.cpf,
      fone: newStudent.fone,
    })
    toast.success("Aluno selecionado para a venda")
  }

  function resetAll() {
    setBolsista(false)
    setStudentTab("search")
    setQuery("")
    setSearchResults([])
    setSelectedStudent(null)
    setNewStudent({ nome: "", email: "", cpf: "", fone: "" })
    setStudentErrors({})
    setCourseSearch("")
    setSelectedItems([])
    setCouponCode("")
    setManualPct("")
    setPaymentMode("normal")
    setInst({ count: 2, value: "", firstDueDate: isoDatePlusDays(7) })
    setAddr({ cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "" })
    setError(null)
    setFieldErrors({})
    setCreated(null)
  }

  async function submit() {
    if (!selectedStudent || !hasSelection) return
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const res = await fetch("/api/painel/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Aluno: existente (studentId) OU dados do novo aluno.
          ...(selectedStudent.isNew
            ? {
                nome: selectedStudent.nome,
                email: selectedStudent.email,
                cpf: selectedStudent.cpf.replace(/\D/g, ""),
                fone: selectedStudent.fone.replace(/\D/g, ""),
              }
            : { studentId: selectedStudent.id }),
          // Curso individual envia tenantCourseId; pacote envia packageId.
          ...(isPkg
            ? { packageId: selectedItems[0].id }
            : { tenantCourseIds: selectedItems.map((i) => i.id) }),
          // Cupom não se aplica a bolsa, carnê nem quando há desconto manual.
          couponCode:
            bolsista || isInstallment || manualValid || !couponCode.trim()
              ? undefined
              : couponCode.trim(),
          // Desconto manual não se aplica a bolsa, carnê nem quando há cupom.
          manualDiscountPercent:
            bolsista || isInstallment || couponCode.trim() || !manualValid
              ? undefined
              : manualPctNumber,
          bolsista: bolsista || undefined,
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
        const fields = body.fields as Record<string, string[] | undefined> | undefined
        if (fields) {
          const mapped: Record<string, string> = {}
          for (const [key, msgs] of Object.entries(fields)) {
            if (msgs && msgs.length) mapped[key] = msgs[0]
          }
          setFieldErrors(mapped)
        }
        const firstError = fields && Object.values(fields).find((arr) => arr && arr.length)
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

  const filteredItems = items.filter((c) =>
    c.nome.toLowerCase().includes(courseSearch.toLowerCase()),
  )

  const finalPrice = bolsista
    ? 0
    : manualValid && hasSelection
      ? Math.max(0, Number((basePrice - manualDiscountAmount).toFixed(2)))
      : basePrice

  // ─── Resultado (venda criada) ──────────────────────────────────────────────

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
              {fmt(created.installment.installmentValue)}
            </h2>
            <p className="mt-2 text-sm">
              O aluno acessa cada boleto na área dele. A <strong>1ª parcela</strong>{" "}
              já está disponível; as próximas ficam disponíveis{" "}
              <strong>7 dias antes de cada vencimento</strong>. O acesso ao curso é
              liberado quando a 1ª parcela for paga.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Mini label="Parcelas" value={`${created.installment.count}x`} />
              <Mini label="Cada parcela" value={fmt(created.installment.installmentValue)} />
              <Mini label="Total" value={fmt(created.installment.total)} accent />
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
            <h2 className="text-base font-bold">Venda criada — link de pagamento gerado</h2>
            <p className="mt-2 text-sm">
              Envie o link abaixo para o aluno finalizar o pagamento na sua própria
              loja (cartão, PIX ou boleto — sem sair do site). A matrícula é ativada
              automaticamente após a confirmação do pagamento.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Mini label="Original" value={fmt(created.basePrice ?? 0)} />
              <Mini label="Desconto" value={fmt(created.discountAmount ?? 0)} />
              <Mini label="Final" value={fmt(created.finalAmount)} accent />
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
          <Button type="button" variant="outline" onClick={resetAll}>
            Nova venda
          </Button>
          <Link href="/painel/vendas">
            <Button variant="outline" type="button" className="text-[var(--color-pmb-green-900)]">
              Ver minhas vendas
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // ─── Formulário ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      {!bolsista && cap > 0 && (
        <p className="text-sm text-gray-500">
          Desconto manual disponível: até <strong>{cap}%</strong>
        </p>
      )}

      {/* ── Bolsa de estudo ─────────────────────────────────────────────── */}
      <label
        data-tour="vendas-nova:bolsista"
        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
      >
        <input
          type="checkbox"
          checked={bolsista}
          onChange={(e) => setBolsista(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-amber-600"
        />
        <span className="text-sm">
          <span className="font-semibold text-amber-900">Bolsista (bolsa de estudo)</span>
          <span className="mt-0.5 block text-xs text-amber-700">
            Matricula o aluno na plataforma de aulas{" "}
            <strong>sem gerar cobrança</strong>. Nenhum link/boleto é criado.
          </span>
        </span>
      </label>

      {/* ── 1. Aluno ─────────────────────────────────────────────────────── */}
      <div data-tour="vendas-nova:aluno">
        <Section title="1. Aluno" done={!!selectedStudent}>
          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div>
                <p className="font-semibold text-[var(--color-pmb-green-900)]">
                  {selectedStudent.nome}
                  {selectedStudent.isNew && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      novo
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedStudent.email}
                  {selectedStudent.cpf ? ` · CPF ${maskCpf(selectedStudent.cpf)}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)}>
                <X className="mr-1 h-4 w-4" /> Trocar
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <TabButton active={studentTab === "search"} onClick={() => setStudentTab("search")}>
                  <Users className="h-3.5 w-3.5" /> Buscar existente
                </TabButton>
                <TabButton active={studentTab === "new"} onClick={() => setStudentTab("new")}>
                  <UserPlus className="h-3.5 w-3.5" /> Novo aluno
                </TabButton>
              </div>

              {studentTab === "search" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Buscar por nome, e-mail ou CPF…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-9"
                    />
                    {searching && (
                      <RefreshCw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                      {searchResults.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudent({ isNew: false, ...s })
                              setQuery("")
                              setSearchResults([])
                            }}
                            className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--color-pmb-lime-50)]"
                          >
                            <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                            <p className="text-xs text-gray-500">
                              {s.email}
                              {s.cpf ? ` · CPF ${maskCpf(s.cpf)}` : ""}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query && !searching && searchResults.length === 0 && (
                    <p className="text-sm text-gray-500">
                      Nenhum aluno encontrado.{" "}
                      <button
                        type="button"
                        className="text-[var(--color-pmb-green)] underline"
                        onClick={() => setStudentTab("new")}
                      >
                        Cadastrar novo
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Nome completo</Label>
                    <Input
                      value={newStudent.nome}
                      onChange={(e) => {
                        setNewStudent((s) => ({ ...s, nome: e.target.value }))
                        setStudentErrors((er) => ({ ...er, nome: "" }))
                      }}
                      className={studentErrors.nome ? "border-red-400" : ""}
                    />
                    {studentErrors.nome && (
                      <p className="mt-1 text-xs text-red-600">{studentErrors.nome}</p>
                    )}
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={newStudent.email}
                      onChange={(e) => {
                        setNewStudent((s) => ({ ...s, email: e.target.value }))
                        setStudentErrors((er) => ({ ...er, email: "" }))
                      }}
                      className={studentErrors.email ? "border-red-400" : ""}
                    />
                    {studentErrors.email && (
                      <p className="mt-1 text-xs text-red-600">{studentErrors.email}</p>
                    )}
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={newStudent.cpf}
                      onChange={(e) => handleCpfChange(e.target.value)}
                      className={studentErrors.cpf ? "border-red-400" : ""}
                    />
                    {studentErrors.cpf && (
                      <p className="mt-1 text-xs text-red-600">{studentErrors.cpf}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Label>Telefone</Label>
                    <Input
                      placeholder="(11) 99999-9999"
                      value={newStudent.fone}
                      onChange={(e) => {
                        setNewStudent((s) => ({ ...s, fone: e.target.value }))
                        setStudentErrors((er) => ({ ...er, fone: "" }))
                      }}
                      className={studentErrors.fone ? "border-red-400" : ""}
                    />
                    {studentErrors.fone && (
                      <p className="mt-1 text-xs text-red-600">{studentErrors.fone}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Button
                      onClick={confirmNewStudent}
                      className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                    >
                      Usar este aluno
                    </Button>
                    <p className="mt-1.5 text-xs text-gray-400">
                      Se o CPF já existir nos seus alunos, os dados são atualizados no
                      momento da venda.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      </div>

      {/* ── 2. Cursos ou pacote ──────────────────────────────────────────── */}
      {/* Vários cursos = uma cobrança só, pela soma dos preços. Um pacote é a
          venda inteira e por isso nunca soma com cursos avulsos. */}
      <div data-tour="vendas-nova:curso">
        <Section title="2. Cursos ou pacote" done={hasSelection}>
          <div className="space-y-3">
            {hasSelection && (
              <ul className="divide-y divide-emerald-100 rounded-xl border border-emerald-200 bg-emerald-50">
                {selectedItems.map((item) => (
                  <li
                    key={`sel:${item.kind}:${item.id}`}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-pmb-green-900)]">
                        {item.nome}
                      </p>
                      <p className="text-xs text-gray-500">
                        {fmt(item.preco)}
                        {item.kind === "package"
                          ? ` · ${item.courseCount} ${item.courseCount === 1 ? "curso" : "cursos"} · pagamento único`
                          : item.paymentType === "MONTHLY"
                            ? " · mensalidade recorrente"
                            : " · pagamento único"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleItem(item)}>
                      <X className="mr-1 h-4 w-4" /> Remover
                    </Button>
                  </li>
                ))}
                {isMulti && (
                  <li className="flex justify-between p-3 text-sm">
                    <span className="text-gray-500">
                      {selectedItems.length} cursos · uma única cobrança
                    </span>
                    <span className="font-bold text-[var(--color-pmb-green-900)]">
                      {fmt(basePrice)}
                    </span>
                  </li>
                )}
              </ul>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={
                  hasSelection
                    ? "Adicionar outro curso…"
                    : "Buscar curso ou pacote da sua vitrine…"
                }
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
              {filteredItems.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">
                  Nenhum curso ou pacote encontrado
                </li>
              )}
              {filteredItems.map((c) => {
                const selected = isSelected(c)
                const blocked = blockedReason(c)
                return (
                  <li key={`${c.kind}:${c.id}`}>
                    <button
                      type="button"
                      disabled={!!blocked}
                      onClick={() => toggleItem(c)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        blocked
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-[var(--color-pmb-lime-50)]"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected
                            ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                            : "border-gray-300"
                        }`}
                        aria-hidden
                      >
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{c.nome}</p>
                        <p className="text-xs text-gray-500">
                          {fmt(c.preco)}
                          {c.kind === "package"
                            ? ` · ${c.courseCount} ${c.courseCount === 1 ? "curso" : "cursos"}`
                            : c.paymentType === "MONTHLY"
                              ? " · mensal"
                              : " · único"}
                          {blocked ? ` · ${blocked}` : ""}
                        </p>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-gray-400">
              Marque quantos cursos quiser (até {MAX_SALE_COURSES}) — o aluno recebe
              um único link com a soma. Pacote é vendido sozinho.
            </p>
          </div>
        </Section>
      </div>

      {/* ── 3. Pagamento (desconto / carnê) ──────────────────────────────── */}
      {!bolsista && (
        <Section
          title="3. Pagamento"
          done={isInstallment ? installmentValueNum > 0 : !!couponCode.trim() || manualValid}
        >
          {/* Forma de pagamento (só quando a unidade tem carnê liberado) */}
          {installmentAvailable && (
            <div className="mb-4">
              <span className="text-xs font-semibold text-gray-600">Forma de pagamento</span>
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

          {isInstallment && installmentConfig ? (
            /* ── Carnê ── */
            <div className="grid gap-3 rounded-xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-green)]/5 p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="v-parcelas">Nº de parcelas</Label>
                <Select
                  value={String(inst.count)}
                  onValueChange={(v) => setInst({ ...inst, count: Number(v) || 2 })}
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
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors["boletoInstallment.count"]}</p>
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
                  onChange={(e) => setInst({ ...inst, firstDueDate: e.target.value })}
                  className="mt-1.5"
                />
                {fieldErrors["boletoInstallment.firstDueDate"] && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors["boletoInstallment.firstDueDate"]}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-600 sm:col-span-3">
                A 1ª parcela fica disponível na hora; as próximas, 7 dias antes de cada
                vencimento, na área do aluno. O acesso é liberado quando a 1ª parcela for paga.
              </p>
            </div>
          ) : (
            /* ── Desconto (manual OU cupom) ── */
            <div data-tour="vendas-nova:cupom" className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Desconto na hora
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={cap}
                    step="0.5"
                    placeholder="0"
                    value={manualPct}
                    onChange={(e) => setManualPct(e.target.value)}
                    disabled={!hasSelection || !!couponCode.trim() || cap <= 0}
                    className="w-28"
                  />
                  <span className="text-sm text-gray-500">% — até {cap}%</span>
                </div>
                {manualPct.trim() !== "" && !manualValid && (
                  <p className="text-xs font-medium text-red-600">
                    {Number.isFinite(manualPctNumber) && manualPctNumber > cap
                      ? `Acima do seu limite de ${cap}%`
                      : "Percentual inválido"}
                  </p>
                )}
                {manualValid && hasSelection && (
                  <p className="text-xs text-emerald-600">
                    − {fmt(manualDiscountAmount)} · de {fmt(basePrice)} por{" "}
                    <strong>{fmt(finalPrice)}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ou cupom
                </p>
                <Input
                  placeholder="CODIGO"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  disabled={!hasSelection || manualPct.trim() !== ""}
                  className="font-mono uppercase"
                  aria-invalid={!!fieldErrors.couponCode}
                />
                {fieldErrors.couponCode && (
                  <p className="text-xs font-medium text-red-600">{fieldErrors.couponCode}</p>
                )}
                <p className="text-xs text-gray-400">
                  O desconto do cupom é validado ao gerar o link de pagamento.
                </p>
              </div>

              {!hasSelection && (
                <p className="text-xs text-gray-400">
                  Selecione o curso ou o pacote antes de aplicar desconto
                </p>
              )}
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
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="v-rua">Logradouro</Label>
                  <Input
                    id="v-rua"
                    value={addr.rua}
                    onChange={(e) => setAddr({ ...addr, rua: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="v-numero">Número</Label>
                  <Input
                    id="v-numero"
                    value={addr.numero}
                    onChange={(e) => setAddr({ ...addr, numero: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="v-bairro">Bairro</Label>
                  <Input
                    id="v-bairro"
                    value={addr.bairro}
                    onChange={(e) => setAddr({ ...addr, bairro: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="v-cidade">Cidade</Label>
                  <Input
                    id="v-cidade"
                    value={addr.cidade}
                    onChange={(e) => setAddr({ ...addr, cidade: e.target.value })}
                    className="mt-1.5"
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
                  />
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── 4. Gerar link / Conceder bolsa ───────────────────────────────── */}
      <div data-tour="vendas-nova:submit">
      <Section
        title={bolsista ? "4. Conceder bolsa" : "4. Gerar link de pagamento"}
        done={false}
      >
        {selectedStudent && hasSelection ? (
          <div className="space-y-4">
            <div className="space-y-1 rounded-xl bg-gray-50 p-4 text-sm">
              <Row label="Aluno" value={selectedStudent.nome} />
              {selectedItems.map((item, i) => (
                <Row
                  key={`sum:${item.kind}:${item.id}`}
                  label={isPkg ? "Pacote" : isMulti ? `Curso ${i + 1}` : "Curso"}
                  value={`${item.nome} — ${fmt(item.preco)}`}
                />
              ))}
              {isInstallment ? (
                <>
                  <Row label="Parcelas" value={`${inst.count}x de ${fmt(installmentValueNum)}`} />
                  <Row label="Total do carnê" value={fmt(installmentTotal)} bold />
                  <Row label="Cobrança" value={`Carnê (boleto ${gateway === "ASAAS" ? "Asaas" : "Mercado Pago"})`} />
                </>
              ) : (
                <>
                  <Row label={bolsista ? "Valor" : "Preço base"} value={fmt(basePrice)} />
                  {bolsista ? (
                    <Row label="Bolsa de estudo" value={`− ${fmt(basePrice)}`} className="text-amber-600" />
                  ) : manualValid ? (
                    <Row
                      label={`Desconto (${manualPctNumber}%)`}
                      value={`− ${fmt(manualDiscountAmount)}`}
                      className="text-emerald-600"
                    />
                  ) : couponCode.trim() ? (
                    <Row label="Cupom" value="a confirmar" className="text-gray-500" />
                  ) : null}
                  <Row label="Total" value={couponCode.trim() && !manualValid ? `até ${fmt(finalPrice)}` : fmt(finalPrice)} bold />
                  <Row
                    label={bolsista ? "Cobrança" : "Pagamento"}
                    value={bolsista ? "Nenhuma (bolsa)" : "Link na sua loja (cartão, PIX ou boleto)"}
                  />
                </>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
              >
                {error}
              </div>
            )}

            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {bolsista ? "Concedendo bolsa…" : isInstallment ? "Gerando carnê…" : "Gerando link…"}
                </>
              ) : bolsista ? (
                "Conceder bolsa de estudo"
              ) : isInstallment ? (
                "Gerar carnê no boleto"
              ) : (
                "Gerar link de pagamento"
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Selecione o aluno e o curso para continuar.</p>
        )}
      </Section>
      </div>
    </div>
  )
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function Section({
  title,
  done,
  children,
}: {
  title: string
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors ${
        done ? "border-emerald-200" : "border-gray-200"
      }`}
    >
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-pmb-green-900)]">
        {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        {title}
      </h2>
      {children}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--color-pmb-green)] text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  )
}

function Row({
  label,
  value,
  bold,
  className,
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${className ?? ""}`}>{value}</span>
    </div>
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
          accent ? "text-[var(--color-pmb-green-700)]" : "text-[var(--color-pmb-green-900)]"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
