"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Search, X, UserPlus, Users, RefreshCw, ExternalLink, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseOption {
  id: string
  nome: string
  preco: number
  paymentType: "ONE_TIME" | "MONTHLY"
  monthlyMonths: number | null
}

interface StudentResult {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
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
  role,
  gateway,
  courses,
}: {
  role: string
  gateway: "MP" | "ASAAS"
  courses: CourseOption[]
}) {
  const cap = role === "PMB_SALES" ? 50 : 100

  // Step 1 — Student
  const [studentTab, setStudentTab] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StudentResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null)
  const [newStudent, setNewStudent] = useState({ nome: "", email: "", cpf: "", fone: "" })
  const [studentErrors, setStudentErrors] = useState<Record<string, string>>({})
  const [savingStudent, setSavingStudent] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 — Course
  const [courseSearch, setCourseSearch] = useState("")
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null)

  // Step 3 — Coupon
  const [couponCode, setCouponCode] = useState("")
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [validatingCoupon, setValidatingCoupon] = useState(false)

  // Step 4 — Link
  const [generatingLink, setGeneratingLink] = useState(false)
  const [linkResult, setLinkResult] = useState<{
    initPoint: string
    finalAmount: number
    discountAmount: number
    gateway: string
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

  // Reset coupon when course changes
  useEffect(() => {
    setCouponResult(null)
    setCouponError(null)
    setCouponCode("")
  }, [selectedCourse])

  // Reset link when student or course changes
  useEffect(() => {
    setLinkResult(null)
  }, [selectedStudent, selectedCourse])

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
        }),
      })
      const body = await res.json()
      if (!res.ok) {
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
    if (!couponCode.trim() || !selectedCourse) return
    setValidatingCoupon(true)
    setCouponError(null)
    setCouponResult(null)
    try {
      const res = await fetch("/api/admin/cupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), courseId: selectedCourse.id }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCouponError(body.error ?? "Cupom inválido")
        return
      }
      setCouponResult(body.data)
    } catch {
      setCouponError("Erro de rede ao validar cupom")
    } finally {
      setValidatingCoupon(false)
    }
  }

  async function generateLink() {
    if (!selectedStudent || !selectedCourse) return
    setGeneratingLink(true)
    try {
      const res = await fetch("/api/admin/vendas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          courseId: selectedCourse.id,
          couponCode: couponResult ? couponCode.trim() : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao gerar link")
        return
      }
      setLinkResult(body.data)
      toast.success("Link de pagamento gerado!")
    } catch {
      toast.error("Erro de rede ao gerar link")
    } finally {
      setGeneratingLink(false)
    }
  }

  const filteredCourses = courses.filter((c) =>
    c.nome.toLowerCase().includes(courseSearch.toLowerCase()),
  )

  const finalPrice = couponResult
    ? couponResult.finalAmount
    : selectedCourse?.preco ?? 0

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">Nova venda direta</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gateway: <strong>{gateway === "ASAAS" ? "Asaas" : "Mercado Pago"}</strong>
          {" · "}Cap de desconto: <strong>{cap}%</strong>
        </p>
      </div>

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
                          <p className="text-xs text-gray-500">{s.email} · CPF {s.cpf}</p>
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
                <div className="col-span-2">
                  <Label>Nome completo</Label>
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

      {/* ── 2. Curso ─────────────────────────────────────────────────────── */}
      <Section title="2. Curso" done={!!selectedCourse}>
        {selectedCourse ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="font-semibold text-[var(--color-pmb-green-900)]">{selectedCourse.nome}</p>
              <p className="text-xs text-gray-500">
                {fmt(selectedCourse.preco)}
                {selectedCourse.paymentType === "MONTHLY" && selectedCourse.monthlyMonths
                  ? ` · ${selectedCourse.monthlyMonths}x mensais`
                  : " · pagamento único"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedCourse(null); setLinkResult(null) }}>
              <X className="h-4 w-4 mr-1" /> Trocar
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar curso…"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
              {filteredCourses.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">Nenhum curso encontrado</li>
              )}
              {filteredCourses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(c)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--color-pmb-lime-50)]"
                  >
                    <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                    <p className="text-xs text-gray-500">
                      {fmt(c.preco)}
                      {c.paymentType === "MONTHLY" && c.monthlyMonths ? ` · ${c.monthlyMonths}x mensais` : " · único"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ── 3. Cupom ─────────────────────────────────────────────────────── */}
      <Section title="3. Cupom (opcional)" done={!!couponResult}>
        {couponResult ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="font-semibold text-emerald-700">
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
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="CODIGO"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null) }}
                disabled={!selectedCourse}
                className="font-mono uppercase"
              />
              <Button
                onClick={validateCoupon}
                disabled={validatingCoupon || !couponCode.trim() || !selectedCourse}
                variant="outline"
              >
                {validatingCoupon ? "Validando…" : "Aplicar"}
              </Button>
            </div>
            {!selectedCourse && (
              <p className="text-xs text-gray-400">Selecione um curso antes de aplicar o cupom</p>
            )}
            {couponError && (
              <p className="text-xs font-medium text-red-600">{couponError}</p>
            )}
            <p className="text-xs text-gray-400">Cap de desconto para seu papel: {cap}%</p>
          </div>
        )}
      </Section>

      {/* ── 4. Gerar link ────────────────────────────────────────────────── */}
      <Section title="4. Gerar link de pagamento" done={!!linkResult}>
        {selectedStudent && selectedCourse ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
              <Row label="Aluno" value={selectedStudent.nome} />
              <Row label="Curso" value={selectedCourse.nome} />
              <Row label="Preço base" value={fmt(selectedCourse.preco)} />
              {couponResult && <Row label="Desconto" value={`− ${fmt(couponResult.discountAmount)}`} className="text-emerald-600" />}
              <Row label="Total" value={fmt(finalPrice)} bold />
              <Row label="Gateway" value={gateway === "ASAAS" ? "Asaas" : "Mercado Pago"} />
            </div>

            {!linkResult ? (
              <Button
                onClick={generateLink}
                disabled={generatingLink}
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                {generatingLink ? "Gerando…" : "Gerar link de pagamento"}
              </Button>
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
                    onClick={() => { navigator.clipboard.writeText(linkResult.initPoint); toast.success("Link copiado") }}
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
                    setSelectedCourse(null)
                    setCouponResult(null)
                    setCouponCode("")
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
