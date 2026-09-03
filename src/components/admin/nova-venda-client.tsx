"use client"

import { GuardianFields } from "@/components/shared/guardian/guardian-fields"
import { useGuardian } from "@/components/shared/guardian/use-guardian"
import { applyServerFieldErrors } from "@/lib/checkout/field-errors"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Search, X, UserPlus, Users, RefreshCw, ExternalLink, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MAX_SALE_COURSES } from "@/lib/enrollment/multi-course"
import {
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
  isRecurringInterval,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseOption {
  id: string
  nome: string
  preco: number
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
}

interface PackageOption {
  id: string
  name: string
  price: number
  courseCount: number
}

interface PlanOption {
  id: string
  name: string
  price: number
  interval: SubscriptionIntervalValue
  courseCount: number
}

/**
 * Item unificado do seletor (curso, pacote ou plano de assinatura). Pacote e
 * plano são sempre vendidos SOZINHOS. O `kind` roteia o corpo da venda:
 * courseIds vs packageId vs planId.
 */
type SaleItem = {
  kind: "course" | "package" | "plan"
  id: string
  nome: string
  preco: number
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
  courseCount?: number
  /** Só em `kind: "plan"` — decide o rótulo do preço e o texto da cobrança. */
  interval?: SubscriptionIntervalValue
}

interface StudentResult {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
  nascimento?: string | null
  responsavel?: string | null
  /** Aluno menor cuja ficha ainda não tem responsável — a venda será recusada. */
  guardianMissing?: boolean
}

interface CouponResult {
  discountAmount: number
  finalAmount: number
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: number
  basePrice: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function maskCpf(v: string) {
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function NovaVendaClient({
  cap,
  gateway,
  courses,
  packages,
  plans,
}: {
  // Cap individual (%) resolvido no servidor (User.maxDiscount; padrão 50 para
  // PMB_SALES, 100 para SUPER_ADMIN). Ver src/lib/coupons/sales-cap.ts.
  cap: number
  gateway: "MP" | "ASAAS"
  courses: CourseOption[]
  packages: PackageOption[]
  plans: PlanOption[]
}) {

  // Lista unificada: cursos primeiro, depois pacotes (prefixados "Pacote:").
  const items: SaleItem[] = [
    ...courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      nome: c.nome,
      preco: c.preco,
      paymentType: c.paymentType,
      monthlyMonths: c.monthlyMonths,
    })),
    ...packages.map((p) => ({
      kind: "package" as const,
      id: p.id,
      nome: `Pacote: ${p.name}`,
      preco: p.price,
      paymentType: "ONE_TIME" as const,
      monthlyMonths: null,
      courseCount: p.courseCount,
    })),
    ...plans.map((p) => ({
      kind: "plan" as const,
      id: p.id,
      nome: `Assinatura: ${p.name}`,
      preco: p.price,
      paymentType: "ONE_TIME" as const,
      monthlyMonths: null,
      courseCount: p.courseCount,
      interval: p.interval,
    })),
  ]

  // Step 1 — Student
  const [studentTab, setStudentTab] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StudentResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null)
  const [newStudent, setNewStudent] = useState({ nome: "", email: "", cpf: "", fone: "" })
  // Data de nascimento + responsável financeiro: mesma regra do servidor.
  const guardianCtl = useGuardian()
  const [studentErrors, setStudentErrors] = useState<Record<string, string>>({})
  const [savingStudent, setSavingStudent] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 — Curso(s) ou pacote. A venda aceita VÁRIOS cursos (uma cobrança só,
  // pela soma dos preços) ou UM pacote — nunca a mistura dos dois.
  const [courseSearch, setCourseSearch] = useState("")
  const [selectedItems, setSelectedItems] = useState<SaleItem[]>([])
  const isPkg = selectedItems[0]?.kind === "package"
  const planItem = selectedItems[0]?.kind === "plan" ? selectedItems[0] : null
  /** Cupom e bolsa não valem para assinatura — ver lib/subscriptions/direct-sale.ts. */
  const isPlan = !!planItem
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
    if (isSelected(item) || item.kind === "package" || item.kind === "plan")
      return null
    // Assinatura é a venda inteira: um curso avulso ao lado dela viraria uma
    // cobrança única somando recorrência com pagamento à vista.
    if (isPlan) return null
    if (!hasSelection) return null
    if (isPkg) return null // clicar num curso troca o pacote pelo curso
    if (hasMonthly) return "o curso mensal é vendido sozinho"
    if (item.paymentType === "MONTHLY") return "curso mensal — vendido sozinho"
    if (selectedItems.length >= MAX_SALE_COURSES)
      return `máximo de ${MAX_SALE_COURSES} cursos por venda`
    return null
  }

  function toggleItem(item: SaleItem) {
    setSelectedItems((prev) => {
      // Pacote e assinatura são a venda inteira: substituem tudo (ou desmarcam).
      if (item.kind === "package" || item.kind === "plan") {
        const same =
          prev.length === 1 && prev[0].kind === item.kind && prev[0].id === item.id
        return same ? [] : [item]
      }
      // Escolher um curso descarta um pacote/assinatura que estivesse marcado.
      const courses = prev.filter((i) => i.kind === "course")
      if (courses.some((i) => i.id === item.id)) {
        return courses.filter((i) => i.id !== item.id)
      }
      return [...courses, item]
    })
  }

  // Step 3 — Desconto (cupom OU manual, nunca os dois)
  const [couponCode, setCouponCode] = useState("")
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [validatingCoupon, setValidatingCoupon] = useState(false)
  // Desconto manual (%) digitado na hora, limitado ao cap do vendedor.
  const [manualPct, setManualPct] = useState("")

  // Bolsa de estudo (sem cobrança)
  const [bolsista, setBolsista] = useState(false)


  // Step 4 — Link
  const [generatingLink, setGeneratingLink] = useState(false)
  const [linkResult, setLinkResult] = useState<{
    initPoint?: string
    finalAmount: number
    discountAmount?: number
    gateway?: string
    scholarship?: boolean
  } | null>(null)

  // Search students (debounced)
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!query.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/alunos?q=${encodeURIComponent(query)}`)
        const body = await res.json()
        setSearchResults(body.data ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [query])

  // Reset coupon/manual discount when the selection changes (o total muda)
  useEffect(() => {
    setCouponResult(null)
    setCouponError(null)
    setCouponCode("")
    setManualPct("")
  }, [selectedItems])

  // Reset link when student or selection changes
  useEffect(() => {
    setLinkResult(null)
  }, [selectedStudent, selectedItems])

  // Ao ativar a bolsa, zera cupom/desconto manual (não há valor a descontar) e o link.
  useEffect(() => {
    setLinkResult(null)
    if (bolsista) {
      setCouponResult(null)
      setCouponCode("")
      setCouponError(null)
      setManualPct("")
    }
  }, [bolsista])

  // Escolher uma assinatura desliga a bolsa e o cupom. O checkbox e o campo
  // somem da tela, mas o ESTADO ficaria — e um `bolsista` verdadeiro invisível
  // mostraria "Total R$ 0" num resumo de venda que vai cobrar o valor cheio.
  useEffect(() => {
    if (!isPlan) return
    setBolsista(false)
    setCouponResult(null)
    setCouponCode("")
    setCouponError(null)
  }, [isPlan])

  function handleCpfChange(v: string) {
    setNewStudent((s) => ({ ...s, cpf: maskCpf(v) }))
    setStudentErrors((e) => ({ ...e, cpf: "" }))
  }

  function validateNewStudent(): boolean {
    const errors: Record<string, string> = {}
    if (!newStudent.nome.trim() || newStudent.nome.trim().length < 3)
      errors.nome = "Nome precisa ter pelo menos 3 caracteres"
    if (!validateEmail(newStudent.email))
      errors.email = "E-mail inválido"
    if (!validateCpf(newStudent.cpf))
      errors.cpf = "CPF inválido"
    if (!guardianCtl.nascimento)
      errors.nascimento = "Informe a data de nascimento do aluno"
    // O servidor é a autoridade; aqui só antecipamos para não gastar um round-trip.
    if (guardianCtl.required && !guardianCtl.guardian.responsavel.trim())
      errors.responsavel = "Aluno menor de 18 anos: informe o responsável financeiro"
    setStudentErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function saveStudent() {
    if (!validateNewStudent()) return
    setSavingStudent(true)
    try {
      const res = await fetch("/api/admin/alunos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: newStudent.nome.trim(),
          email: newStudent.email.trim(),
          cpf: newStudent.cpf,
          fone: newStudent.fone.trim() || undefined,
          nascimento: guardianCtl.nascimento,
          ...guardianCtl.payload(),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        // O 400 do responsável vem por CAMPO — sem isto o vendedor só veria
        // "Dados inválidos" e não saberia o que corrigir.
        if (body.fields) {
          setStudentErrors(
            applyServerFieldErrors(body.fields, () => true) as Record<string, string>,
          )
        }
        toast.error(body.error ?? "Falha ao salvar aluno")
        return
      }
      setSelectedStudent(body.data)
      toast.success(body.data.existed ? "Aluno existente encontrado e selecionado" : "Aluno criado e registrado na plataforma de aulas")
    } catch {
      toast.error("Erro de rede ao salvar aluno")
    } finally {
      setSavingStudent(false)
    }
  }

  async function validateCoupon() {
    // Cupom (preview) só para curso(s) — a rota de validação usa courseIds e
    // soma os preços, exatamente como a venda vai cobrar.
    if (!couponCode.trim() || !hasSelection || isPkg || isPlan) return
    setValidatingCoupon(true)
    setCouponError(null)
    setCouponResult(null)
    try {
      const res = await fetch("/api/admin/cupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          courseIds: selectedItems.map((i) => i.id),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCouponError(body.error ?? "Cupom inválido")
        return
      }
      setCouponResult(body.data)
      // Cupom aplicado substitui o desconto manual (nunca os dois).
      setManualPct("")
    } catch {
      setCouponError("Erro de rede ao validar cupom")
    } finally {
      setValidatingCoupon(false)
    }
  }

  // Preço base da venda: a SOMA dos itens selecionados (um pacote sempre está
  // sozinho, então a soma é o preço dele).
  const basePrice =
    Math.round(selectedItems.reduce((sum, i) => sum + i.preco, 0) * 100) / 100

  // Desconto manual derivado do input (aceita vírgula BR). Válido quando está
  // entre 0 (exclusivo) e o cap do vendedor; acima do cap o form bloqueia.
  const manualPctNumber = manualPct.trim() === "" ? 0 : Number(manualPct.replace(",", "."))
  const manualValid =
    Number.isFinite(manualPctNumber) && manualPctNumber > 0 && manualPctNumber <= cap
  const manualDiscountAmount =
    manualValid && hasSelection
      ? Number(((basePrice * manualPctNumber) / 100).toFixed(2))
      : 0

  async function generateLink() {
    if (!selectedStudent || !hasSelection) return
    setGeneratingLink(true)
    try {
      const res = await fetch("/api/admin/vendas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          // Curso(s) enviam courseIds; pacote, packageId; assinatura, planId.
          ...(isPlan
            ? { planId: selectedItems[0].id }
            : isPkg
              ? { packageId: selectedItems[0].id }
              : { courseIds: selectedItems.map((i) => i.id) }),
          // Assinatura recusa cupom e bolsa no servidor — não mandar aqui evita
          // um 400 que o vendedor não teria como interpretar.
          couponCode:
            isPlan || bolsista || !couponResult ? undefined : couponCode.trim(),
          manualDiscountPercent:
            bolsista || couponResult || !manualValid ? undefined : manualPctNumber,
          bolsista: isPlan ? undefined : bolsista || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? (bolsista ? "Falha ao conceder bolsa" : "Falha ao gerar link"))
        return
      }
      setLinkResult(body.data)
      toast.success(
        body.data?.scholarship
          ? "Bolsa concedida! Aluno matriculado na plataforma de aulas."
          : "Link de pagamento gerado!",
      )
    } catch {
      toast.error("Erro de rede ao gerar link")
    } finally {
      setGeneratingLink(false)
    }
  }

  const filteredItems = items.filter((c) =>
    c.nome.toLowerCase().includes(courseSearch.toLowerCase()),
  )

  const finalPrice = bolsista
    ? 0
    : couponResult
      ? couponResult.finalAmount
      : manualValid && hasSelection
        ? Math.max(0, Number((basePrice - manualDiscountAmount).toFixed(2)))
        : basePrice

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">Nova venda direta</h1>
        <p className="mt-1 text-sm text-gray-500">
          {bolsista ? (
            <>Bolsa de estudo — <strong>sem cobrança</strong></>
          ) : (
            <>
              Gateway: <strong>{gateway === "ASAAS" ? "Asaas" : "Mercado Pago"}</strong>
              {" · "}Desconto manual: até <strong>{cap}%</strong>
            </>
          )}
        </p>
      </div>

      {/* ── Bolsa de estudo ─────────────────────────────────────────────── */}
      {/* Assinatura não aceita bolsa: sem cobrança não há recorrência a criar no
          gateway, e o servidor recusa. Esconder é melhor que deixar marcar e
          devolver um 400 que o vendedor não teria como interpretar. Quem quer
          dar acesso de graça usa a bolsa numa venda de CURSO. */}
      {!isPlan && (
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <input
          type="checkbox"
          checked={bolsista}
          onChange={(e) => setBolsista(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-amber-600"
        />
        <span className="text-sm">
          <span className="font-semibold text-amber-900">Bolsista (bolsa de estudo)</span>
          <span className="mt-0.5 block text-xs text-amber-700">
            O aluno é criado na plataforma de aulas e matriculado imediatamente,
            <strong> sem gerar cobrança</strong> no gateway de pagamento.
          </span>
        </span>
      </label>
      )}

      {/* ── 1. Aluno ─────────────────────────────────────────────────────── */}
      <Section title="1. Aluno" done={!!selectedStudent}>
        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="font-semibold text-[var(--color-pmb-green-900)]">{selectedStudent.nome}</p>
              <p className="text-xs text-gray-500">{selectedStudent.email} · CPF {selectedStudent.cpf}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setLinkResult(null) }}>
              <X className="h-4 w-4 mr-1" /> Trocar
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
                          onClick={() => { setSelectedStudent(s); setQuery("") }}
                          className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--color-pmb-lime-50)]"
                        >
                          <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                          <p className="text-xs text-gray-500">
                            {s.email} · CPF {s.cpf}
                            {s.nascimento ? ` · nasc. ${s.nascimento.split("-").reverse().join("/")}` : " · sem data de nascimento"}
                            {s.responsavel ? ` · resp. ${s.responsavel}` : ""}
                          </p>
                          {s.guardianMissing && (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              Menor de 18 sem responsável financeiro — complete a ficha antes de vender.
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query && !searching && searchResults.length === 0 && (
                  <p className="text-sm text-gray-500">Nenhum aluno encontrado. <button type="button" className="text-[var(--color-pmb-green)] underline" onClick={() => setStudentTab("new")}>Criar novo</button></p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong className="block">Por que pedimos a data de nascimento</strong>
                  O certificado é emitido com o nome do <strong>aluno</strong>,
                  exatamente como está no cadastro. Se o aluno tem menos de 18
                  anos, cadastre-o com o nome dele e informe a mãe, o pai ou o
                  responsável no bloco &quot;Responsável financeiro&quot;. A
                  cobrança sai no CPF do responsável; o certificado, no nome do
                  aluno.
                </div>
                <div className="col-span-2">
                  <Label>Nome completo do aluno</Label>
                  <Input
                    value={newStudent.nome}
                    onChange={(e) => { setNewStudent((s) => ({ ...s, nome: e.target.value })); setStudentErrors((er) => ({ ...er, nome: "" })) }}
                    className={studentErrors.nome ? "border-red-400" : ""}
                  />
                  {studentErrors.nome && <p className="mt-1 text-xs text-red-600">{studentErrors.nome}</p>}
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={newStudent.email}
                    onChange={(e) => { setNewStudent((s) => ({ ...s, email: e.target.value })); setStudentErrors((er) => ({ ...er, email: "" })) }}
                    className={studentErrors.email ? "border-red-400" : ""}
                  />
                  {studentErrors.email && <p className="mt-1 text-xs text-red-600">{studentErrors.email}</p>}
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={newStudent.cpf}
                    onChange={(e) => handleCpfChange(e.target.value)}
                    className={studentErrors.cpf ? "border-red-400" : ""}
                  />
                  {studentErrors.cpf && <p className="mt-1 text-xs text-red-600">{studentErrors.cpf}</p>}
                </div>
                <div>
                  <Label>Telefone <span className="text-gray-400">(opcional)</span></Label>
                  <Input
                    value={newStudent.fone}
                    onChange={(e) => setNewStudent((s) => ({ ...s, fone: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Data de nascimento do aluno</Label>
                  <Input
                    type="date"
                    value={guardianCtl.nascimento}
                    onChange={(e) => { guardianCtl.setNascimento(e.target.value); setStudentErrors((er) => ({ ...er, nascimento: "" })) }}
                    className={studentErrors.nascimento ? "border-red-400" : ""}
                  />
                  {studentErrors.nascimento && <p className="mt-1 text-xs text-red-600">{studentErrors.nascimento}</p>}
                  <p className="mt-1 text-xs text-gray-500">
                    Nunca cadastre o responsável como se fosse o aluno — o
                    certificado sairia no nome errado.
                  </p>
                </div>
                {!guardianCtl.required && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-[var(--color-pmb-green)] underline underline-offset-2"
                      onClick={() => guardianCtl.setManualOpen(!guardianCtl.manualOpen)}
                    >
                      {guardianCtl.manualOpen ? "Quem paga é o próprio aluno" : "Quem vai pagar não é o aluno?"}
                    </button>
                  </div>
                )}
                {guardianCtl.open && (
                  <div className="col-span-2">
                    <GuardianFields
                      value={guardianCtl.guardian}
                      onChange={guardianCtl.setGuardian}
                      fieldErrors={studentErrors}
                      disabled={savingStudent}
                      required={guardianCtl.required}
                      variant="staff"
                      formatCpf={maskCpf}
                      formatPhone={(v) => v}
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <Button
                    onClick={saveStudent}
                    disabled={savingStudent}
                    className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
                  >
                    {savingStudent ? "Salvando…" : "Usar este aluno"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── 2. Cursos ou pacote ──────────────────────────────────────────── */}
      {/* Vários cursos = uma cobrança só, pela soma dos preços. Um pacote é a
          venda inteira e por isso nunca soma com cursos avulsos. */}
      <Section title="2. Cursos ou pacote" done={hasSelection}>
        <div className="space-y-3">
          {hasSelection && (
            <ul className="divide-y divide-emerald-100 rounded-xl border border-emerald-200 bg-emerald-50">
              {selectedItems.map((item) => (
                <li key={`sel:${item.kind}:${item.id}`} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-pmb-green-900)]">{item.nome}</p>
                    <p className="text-xs text-gray-500">
                      {fmt(item.preco)}
                      {item.kind === "package"
                        ? ` · ${item.courseCount} ${item.courseCount === 1 ? "curso" : "cursos"} · pagamento único`
                        : item.paymentType === "MONTHLY" && item.monthlyMonths
                          ? ` · ${item.monthlyMonths}x mensais`
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
                  <span className="font-bold text-[var(--color-pmb-green-900)]">{fmt(basePrice)}</span>
                </li>
              )}
            </ul>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={hasSelection ? "Adicionar outro curso…" : "Buscar curso, pacote ou assinatura…"}
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
            {filteredItems.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">Nenhum curso, pacote ou assinatura encontrado</li>
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
                        {c.kind === "plan" && c.interval
                          ? `${INTERVAL_PRICE_SUFFIX[c.interval]} · ${INTERVAL_LABEL[c.interval]} · ${c.courseCount} ${c.courseCount === 1 ? "curso" : "cursos"}`
                          : c.kind === "package"
                          ? ` · ${c.courseCount} ${c.courseCount === 1 ? "curso" : "cursos"}`
                          : c.paymentType === "MONTHLY" && c.monthlyMonths ? ` · ${c.monthlyMonths}x mensais` : " · único"}
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
            um único link com a soma. Pacote e assinatura são vendidos sozinhos.
          </p>
        </div>
      </Section>

      {/* ── 3. Desconto ──────────────────────────────────────────────────── */}
      {/* Desconto manual (%) na hora, limitado ao cap do vendedor, OU cupom.
          Cupom só para curso: a validação (preview) usa courseId. */}
      {!bolsista && (
      <Section title="3. Desconto (opcional)" done={!!couponResult || manualValid}>
        {couponResult ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="font-semibold text-emerald-700">
                Cupom {couponCode}:{" "}
                {couponResult.discountType === "PERCENTAGE"
                  ? `${couponResult.discountValue}% de desconto`
                  : `${fmt(couponResult.discountValue)} de desconto`}
              </p>
              <p className="text-xs text-gray-500">
                De {fmt(couponResult.basePrice)} por <strong>{fmt(couponResult.finalAmount)}</strong>
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setCouponResult(null); setCouponCode("") }}>
              <X className="h-4 w-4 mr-1" /> Remover
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desconto manual na hora */}
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
                  disabled={!hasSelection}
                  className="w-28"
                />
                <span className="text-sm text-gray-500">% — até {cap}%</span>
              </div>
              {manualPct.trim() !== "" && !manualValid && (
                <p className="text-xs font-medium text-red-600">
                  {Number.isFinite(manualPctNumber) && manualPctNumber > cap
                    ? `Acima do seu cap de ${cap}%`
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

            {/* Cupom — só curso(s) (a validação usa courseIds). Aplicar cupom é
                livre (qualquer cupom ativo, mesmo acima do cap — quem criou já
                foi validado); o cap vale só para o desconto manual acima. */}
            {!isPkg && !isPlan && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ou cupom
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="CODIGO"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null) }}
                    disabled={!hasSelection}
                    className="font-mono uppercase"
                  />
                  <Button
                    onClick={validateCoupon}
                    disabled={validatingCoupon || !couponCode.trim() || !hasSelection}
                    variant="outline"
                  >
                    {validatingCoupon ? "Validando…" : "Aplicar"}
                  </Button>
                </div>
                {couponError && (
                  <p className="text-xs font-medium text-red-600">{couponError}</p>
                )}
              </div>
            )}

            {!hasSelection && (
              <p className="text-xs text-gray-400">
                Selecione o curso ou o pacote antes de aplicar desconto
              </p>
            )}
            <p className="text-xs text-gray-400">
              Desconto manual: até {cap}%. Cupons ativos podem ser aplicados
              independentemente do seu cap.
            </p>
          </div>
        )}
      </Section>
      )}

      {/* ── 4. Gerar link / Conceder bolsa ───────────────────────────────── */}
      <Section title={bolsista ? "4. Conceder bolsa" : "4. Gerar link de pagamento"} done={!!linkResult}>
        {selectedStudent && hasSelection ? (
          <div className="space-y-4">
            {selectedStudent.guardianMissing && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong className="block">Cadastro incompleto</strong>
                {selectedStudent.nome} tem menos de 18 anos e não tem responsável
                financeiro na ficha. A cobrança precisa sair no CPF de um adulto —
                e o certificado, no nome do aluno.{" "}
                <a
                  href={`/admin/alunos/${selectedStudent.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  Completar cadastro do aluno
                </a>
              </div>
            )}
            <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
              <Row label="Aluno" value={selectedStudent.nome} />
              {selectedItems.map((item, i) => (
                <Row
                  key={`sum:${item.kind}:${item.id}`}
                  label={
                    isPlan
                      ? "Assinatura"
                      : isPkg
                        ? "Pacote"
                        : isMulti
                          ? `Curso ${i + 1}`
                          : "Curso"
                  }
                  value={`${item.nome} — ${fmt(item.preco)}`}
                />
              ))}
              <Row label={bolsista ? "Valor" : "Preço base"} value={fmt(basePrice)} />
              {bolsista ? (
                <Row label="Bolsa de estudo" value={`− ${fmt(basePrice)}`} className="text-amber-600" />
              ) : couponResult ? (
                <Row label="Desconto (cupom)" value={`− ${fmt(couponResult.discountAmount)}`} className="text-emerald-600" />
              ) : manualValid ? (
                <Row label={`Desconto (${manualPctNumber}%)`} value={`− ${fmt(manualDiscountAmount)}`} className="text-emerald-600" />
              ) : null}
              <Row
                label={
                  planItem && isRecurringInterval(planItem.interval ?? "MONTHLY")
                    ? "Valor por cobrança"
                    : "Total"
                }
                value={fmt(finalPrice)}
                bold
              />
              {planItem && (
                // Numa recorrência o gateway guarda UM valor: o desconto que o
                // vendedor dá agora vale para TODAS as cobranças. Sem este aviso
                // um "10% de desconto" pareceria valer só na primeira.
                <Row
                  label="Cobrança"
                  value={
                    isRecurringInterval(planItem.interval ?? "MONTHLY")
                      ? `${INTERVAL_CHARGE_LABEL[planItem.interval ?? "MONTHLY"]} — o desconto vale para todas as cobranças`
                      : INTERVAL_CHARGE_LABEL[planItem.interval ?? "MONTHLY"]
                  }
                />
              )}
              <Row label={bolsista ? "Cobrança" : "Gateway"} value={bolsista ? "Nenhuma (bolsa)" : gateway === "ASAAS" ? "Asaas" : "Mercado Pago"} />
            </div>

            {!linkResult ? (
              <Button
                onClick={generateLink}
                // A API recusa com GUARDIAN_REQUIRED; desabilitar aqui evita
                // que o vendedor descubra a regra só depois de clicar.
                disabled={generatingLink || !!selectedStudent?.guardianMissing}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {generatingLink
                  ? bolsista ? "Concedendo…" : "Gerando…"
                  : bolsista ? "Conceder bolsa de estudo" : "Gerar link de pagamento"}
              </Button>
            ) : linkResult.scholarship ? (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-amber-700">
                  <CheckCircle2 className="h-4 w-4" /> Bolsa concedida
                </div>
                <p className="text-sm text-amber-800">
                  {selectedStudent.nome} foi matriculado em{" "}
                  <strong>{selectedItems.map((i) => i.nome).join(", ")}</strong> na
                  plataforma de aulas, sem cobrança. As credenciais de acesso foram enviadas por e-mail.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-500"
                  onClick={() => {
                    setSelectedStudent(null)
                    setSelectedItems([])
                    setCouponResult(null)
                    setCouponCode("")
                    setManualPct("")
                    setLinkResult(null)
                    setBolsista(false)
                    setNewStudent({ nome: "", email: "", cpf: "", fone: "" })
                  }}
                >
                  Nova venda
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Link gerado com sucesso
                </div>
                <p className="break-all text-xs font-mono text-gray-700">{linkResult.initPoint}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { if (linkResult.initPoint) { navigator.clipboard.writeText(linkResult.initPoint); toast.success("Link copiado") } }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                  </Button>
                  <a href={linkResult.initPoint} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                  </a>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-500"
                  onClick={() => {
                    setSelectedStudent(null)
                    setSelectedItems([])
                    setCouponResult(null)
                    setCouponCode("")
                    setManualPct("")
                    setLinkResult(null)
                    setNewStudent({ nome: "", email: "", cpf: "", fone: "" })
                  }}
                >
                  Nova venda
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Selecione o aluno e o curso para continuar.</p>
        )}
      </Section>
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
    <div className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors ${done ? "border-emerald-200" : "border-gray-200"}`}>
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

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${className ?? ""}`}>{value}</span>
    </div>
  )
}
