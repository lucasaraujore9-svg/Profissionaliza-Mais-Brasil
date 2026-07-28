"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2, Search, ShieldCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  DEFAULT_CERTIFICATE_MIN_PERCENT,
  isEnrollmentConcludedForCertificate,
} from "@/lib/certificates/eligibility"
import { enrollmentStatusLabel } from "@/lib/labels"

const STEPPER = [
  { n: 1, label: "Aluno" },
  { n: 2, label: "Matrícula" },
  { n: 3, label: "Confirmar" },
] as const

function IssueStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Etapas da emissão">
      {STEPPER.map((s, i) => {
        const isDone = s.n < current
        const isActive = s.n === current
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <div
              aria-current={isActive ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-colors",
                  isDone
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                    : isActive
                      ? "border-[var(--color-pmb-green)] bg-white text-[var(--color-pmb-green)] shadow-sm"
                      : "border-gray-200 bg-white text-gray-400",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  isActive
                    ? "text-[var(--color-pmb-green-900)]"
                    : "text-gray-500",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPPER.length - 1 && (
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  isDone ? "bg-[var(--color-pmb-green)]" : "bg-gray-200",
                )}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface StudentOption {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  tenantName?: string
}

interface EnrollmentOption {
  id: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "COMPLETED"
  courseName: string
  cargaHoraria: string | null
  progressPercent: number
  progressStatus: string | null
  hasActiveCertificate: boolean
  tenantName?: string
  /**
   * Cota de aulas: parcelamento em aberto. O backend RECUSA a emissão, então a
   * UI não pode oferecer o botão — ele falharia sempre.
   */
  paceBlocksConclusion?: boolean
  installmentsPaid?: number
  installmentsTotal?: number | null
}

interface Props {
  studentSearchEndpoint: string
  enrollmentsEndpoint: string
  issueEndpoint: string
  /**
   * Se true, mostra coluna de tenant nos resultados (admin).
   */
  showTenantContext?: boolean
  /**
   * Se true, permite forcar a emissao para matriculas nao concluidas
   * (exclusivo do SUPER_ADMIN). Demais papeis veem apenas a mensagem de
   * bloqueio. A regra tambem e aplicada no servidor.
   */
  canForce?: boolean
  /**
   * Percentual minimo de progresso para considerar o curso concluido
   * (espelha SystemSettings.certificateMinPercent). Usado apenas para a
   * decisao de exibicao/bloqueio na UI — o servidor reaplica a regra.
   */
  minPercent?: number
  successHref?: string
}

export function CertificateIssueForm({
  studentSearchEndpoint,
  enrollmentsEndpoint,
  issueEndpoint,
  showTenantContext,
  canForce = false,
  minPercent = DEFAULT_CERTIFICATE_MIN_PERCENT,
  successHref,
}: Props) {
  const [q, setQ] = useState("")
  const [students, setStudents] = useState<StudentOption[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(
    null,
  )
  const [enrollments, setEnrollments] = useState<EnrollmentOption[]>([])
  const [enrollmentLoading, setEnrollmentLoading] = useState(false)
  const [selectedEnrollment, setSelectedEnrollment] =
    useState<EnrollmentOption | null>(null)
  const [force, setForce] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  const debounceRef = useRef<number | null>(null)

  const searchStudents = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setStudents([])
        return
      }
      setSearching(true)
      try {
        const url = `${studentSearchEndpoint}?q=${encodeURIComponent(value)}`
        const res = await fetch(url, { cache: "no-store" })
        const body = await res.json()
        if (!res.ok) {
          setStudents([])
          return
        }
        // Os endpoints retornam { data: { students: [...] } }; aceitamos
        // tambem o formato de array direto por robustez.
        const raw = body.data as
          | Array<Record<string, unknown>>
          | { students?: Array<Record<string, unknown>> }
          | null
        const data: Array<Record<string, unknown>> = Array.isArray(raw)
          ? raw
          : raw?.students ?? []
        const list: StudentOption[] = data.map((s) => ({
          id: String(s.id ?? ""),
          nome: String(s.nome ?? ""),
          email: (s.email as string | null) ?? null,
          cpf: (s.cpf as string | null) ?? null,
          tenantName:
            typeof s.tenant === "object" && s.tenant
              ? (s.tenant as { name?: string }).name ?? undefined
              : undefined,
        }))
        setStudents(list)
      } catch {
        setStudents([])
      } finally {
        setSearching(false)
      }
    },
    [studentSearchEndpoint],
  )

  useEffect(() => {
    if (selectedStudent) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      searchStudents(q)
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [q, selectedStudent, searchStudents])

  async function pickStudent(student: StudentOption) {
    setSelectedStudent(student)
    setSelectedEnrollment(null)
    setEnrollmentLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${enrollmentsEndpoint}?studentId=${encodeURIComponent(student.id)}`,
        { cache: "no-store" },
      )
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar matrículas")
        setEnrollments([])
        return
      }
      const items = (body.data?.enrollments ?? []) as EnrollmentOption[]
      setEnrollments(items)
    } catch {
      setError("Erro de rede")
      setEnrollments([])
    } finally {
      setEnrollmentLoading(false)
    }
  }

  function clearStudent() {
    setSelectedStudent(null)
    setEnrollments([])
    setSelectedEnrollment(null)
    setForce(false)
  }

  async function submit() {
    if (!selectedEnrollment) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(issueEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: selectedEnrollment.id,
          force,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao emitir certificado")
        return
      }
      const cert = body.data?.certificate
      setSuccessCode(cert?.code ?? null)
    } catch {
      setError("Erro de rede ao emitir")
    } finally {
      setSubmitting(false)
    }
  }

  if (successCode) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">
              Certificado emitido com sucesso
            </h3>
            <p className="mt-1 text-xs text-emerald-800">
              Código:{" "}
              <span className="font-mono font-semibold">{successCode}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {successHref && (
                <a
                  href={successHref}
                  className="inline-flex items-center rounded-lg bg-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
                >
                  Ver lista
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setSuccessCode(null)
                  clearStudent()
                  setQ("")
                }}
                className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                Emitir outro
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const currentStep: 1 | 2 | 3 = selectedEnrollment
    ? 3
    : selectedStudent
      ? 2
      : 1

  // Conclusao considera o progresso real (status COMPLETED, progressStatus
  // CONCLUIDO ou progressPercent >= minimo) — nao apenas o status da matricula.
  const selectedConcluded = selectedEnrollment
    ? isEnrollmentConcludedForCertificate(selectedEnrollment, minPercent)
    : false
  // Concluiu o conteúdo mas ainda deve parcelas: a emissão fica travada até a
  // quitação. Nem o `force` do SUPER_ADMIN é oferecido aqui — furar a cota é
  // decisão de negócio, feita em "Liberar cota" na gestão do aluno, onde fica
  // auditada.
  const selectedPaceBlocked = selectedEnrollment?.paceBlocksConclusion === true

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
        <IssueStepper current={currentStep} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          1. Escolha o aluno
        </h3>

        {selectedStudent ? (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 p-4">
            <div>
              <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                {selectedStudent.nome}
              </div>
              <div className="text-xs text-gray-600">
                {selectedStudent.email ?? "sem e-mail"}
                {selectedStudent.cpf ? ` · CPF ${selectedStudent.cpf}` : ""}
                {showTenantContext && selectedStudent.tenantName
                  ? ` · ${selectedStudent.tenantName}`
                  : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={clearStudent}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, e-mail ou CPF"
                className="pl-9"
              />
            </div>

            {searching && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                Buscando alunos...
              </div>
            )}

            {!searching && q && students.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Nenhum aluno encontrado.
              </div>
            )}

            {students.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {students.slice(0, 12).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickStudent(s)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-[var(--color-pmb-green-900)]">
                          {s.nome}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {s.email ?? "sem e-mail"}
                          {s.cpf ? ` · CPF ${s.cpf}` : ""}
                          {showTenantContext && s.tenantName
                            ? ` · ${s.tenantName}`
                            : ""}
                        </div>
                      </div>
                      <span className="text-xs text-[var(--color-pmb-green)]">
                        Selecionar
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {selectedStudent && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            2. Escolha a matrícula
          </h3>

          {enrollmentLoading ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
              Carregando matrículas...
            </div>
          ) : enrollments.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Este aluno não tem matrículas elegíveis.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {enrollments.map((e) => {
                const isSelected = selectedEnrollment?.id === e.id
                const completed = isEnrollmentConcludedForCertificate(
                  e,
                  minPercent,
                )
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEnrollment(e)}
                      disabled={e.hasActiveCertificate}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected
                          ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                          {e.courseName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold">
                            {enrollmentStatusLabel(e.status)}
                          </span>
                          <span>{e.cargaHoraria ?? "Sem carga"}</span>
                          <span>Progresso: {e.progressPercent}%</span>
                          {showTenantContext && e.tenantName && (
                            <span className="text-gray-500">
                              · {e.tenantName}
                            </span>
                          )}
                          {e.hasActiveCertificate && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                              Já tem certificado
                            </span>
                          )}
                        </div>
                      </div>
                      {e.paceBlocksConclusion ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Parcelas em aberto
                        </span>
                      ) : !completed && !e.hasActiveCertificate ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Não concluído
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {selectedEnrollment && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            3. Confirmar emissão
          </h3>

          {!selectedConcluded && canForce && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-900">
                  Matrícula não está marcada como concluída
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  O progresso atual é {selectedEnrollment.progressPercent}%. Como
                  administrador do sistema, você pode emitir mesmo sem conclusão.
                </p>
                <Label
                  htmlFor="force-issue"
                  className="mt-3 inline-flex cursor-pointer items-center gap-2"
                >
                  <input
                    id="force-issue"
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400"
                  />
                  <span className="text-xs font-semibold text-amber-900">
                    Emitir mesmo sem concluir o curso
                  </span>
                </Label>
              </div>
            </div>
          )}

          {selectedPaceBlocked && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-900">
                  Parcelamento em aberto — certificado bloqueado
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {selectedEnrollment.installmentsTotal
                    ? `Foram pagas ${selectedEnrollment.installmentsPaid ?? 0} de ${selectedEnrollment.installmentsTotal} parcelas. `
                    : ""}
                  O certificado é liberado assim que a venda for quitada. Para
                  abrir exceção, use “Liberar cota” na gestão do aluno — a
                  liberação fica registrada com quem a concedeu.
                </p>
              </div>
            </div>
          )}

          {!selectedConcluded && !canForce && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-900">
                  Aluno ainda não concluiu o curso
                </p>
                <p className="mt-1 text-xs text-red-800">
                  O progresso atual é {selectedEnrollment.progressPercent}%. O
                  aluno ainda não concluiu o curso, por isso não é possível
                  emitir o certificado.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {!(!selectedConcluded && !canForce) && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={submitting || selectedPaceBlocked || (!selectedConcluded && !force)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Emitir certificado
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
