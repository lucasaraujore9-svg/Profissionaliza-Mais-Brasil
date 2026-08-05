"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  X,
  Mail,
  MessageSquare,
  Ban,
  Unlock,
  Phone,
  IdCard,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImpersonateButton } from "@/components/shared/impersonate-button"
import { StudentStatusBadge } from "./student-status"
import { SaleStatusBadge } from "./sale-status"
import type { StudentStatus } from "./student-table"

interface EnrollmentDetail {
  id: string
  courseName: string
  packageName: string | null
  packageCourseCount: number | null
  packagePrimary: boolean
  /** Venda direta multi-curso: total de cursos que esta cobrança cobre. */
  bundleCourseCount: number | null
  /** Curso da matrícula que pagou, quando esta é satélite de uma venda multi-curso. */
  bundleOfCourseName: string | null
  status: string
  amount: number
  createdAt: string
  startedAt: string | null
}

export interface StudentDetail {
  id: string
  nome: string
  email: string
  cpf: string | null
  fone: string | null
  status: StudentStatus
  createdAt: string
  totalPaid: number
  enrollments: EnrollmentDetail[]
}

interface StudentDetailDrawerProps {
  open: boolean
  studentId: string | null
  onClose: () => void
  onToggleBlock: (id: string, currentStatus: StudentStatus) => Promise<void>
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

export function StudentDetailDrawer({
  open,
  studentId,
  onClose,
  onToggleBlock,
}: StudentDetailDrawerProps) {
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<
    { type: "success" | "error"; text: string } | null
  >(null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!open || !studentId) return
    let cancelled = false
    setLoading(true)
    setSendResult(null)
    setMessage("")
    fetch(`/api/painel/alunos/${studentId}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return
        if (body.data) {
          setStudent(body.data)
        } else {
          setStudent(null)
        }
      })
      .catch(() => {
        if (!cancelled) setStudent(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, studentId])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  async function handleSendMessage() {
    if (!student) return
    const trimmed = message.trim()
    if (trimmed.length === 0) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch(`/api/painel/alunos/${student.id}/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: trimmed }),
      })
      const body = await res.json()
      if (!res.ok) {
        setSendResult({
          type: "error",
          text: body.error ?? "Falha ao enviar mensagem",
        })
      } else {
        setSendResult({ type: "success", text: "Mensagem enviada com sucesso." })
        setMessage("")
      }
    } catch {
      setSendResult({ type: "error", text: "Erro de rede ao enviar mensagem." })
    } finally {
      setSending(false)
    }
  }

  async function handleToggleBlock() {
    if (!student) return
    setToggling(true)
    try {
      await onToggleBlock(student.id, student.status)
      const res = await fetch(`/api/painel/alunos/${student.id}`)
      const body = await res.json()
      if (body.data) setStudent(body.data)
    } finally {
      setToggling(false)
    }
  }

  const isBlocked = student?.status === "BLOQUEADO"

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-drawer-title"
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2
              id="student-detail-drawer-title"
              className="text-base font-semibold text-[var(--color-pmb-green-900)]"
            >
              Detalhes do aluno
            </h2>
            {studentId && (
              <Link
                href={`/painel/alunos/${studentId}`}
                className="inline-flex items-center gap-0.5 rounded-md bg-[var(--color-pmb-lime-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-pmb-green-700)] hover:bg-[var(--color-pmb-lime-100)]"
              >
                Ver perfil completo
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-6 py-6">
          {loading || !student ? (
            <div className="py-20 text-center text-sm text-gray-500">
              {loading ? "Carregando aluno..." : "Aluno não encontrado."}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-lg font-semibold text-[var(--color-pmb-green-700)]">
                  {initials(student.nome)}
                </div>
                <div>
                  <div className="text-base font-semibold text-[var(--color-pmb-green-900)]">
                    {student.nome}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Mail className="h-3 w-3" />
                    {student.email}
                  </div>
                  {student.fone && (
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Phone className="h-3 w-3" />
                      {student.fone}
                    </div>
                  )}
                  {student.cpf && (
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <IdCard className="h-3 w-3" />
                      {student.cpf}
                    </div>
                  )}
                  <div className="mt-2">
                    <StudentStatusBadge status={student.status} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center">
                <div>
                  <div className="font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">
                    {student.enrollments.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Cursos
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">
                    {formatDate(student.createdAt)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Desde
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">
                    {formatCurrency(student.totalPaid)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Valor total
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  Cursos e pacotes
                </h3>
                {student.enrollments.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-xs text-gray-500">
                    Nenhum curso matriculado.
                  </div>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {student.enrollments.map((course) => {
                      const isPackagePurchase =
                        course.packagePrimary && !!course.packageName
                      return (
                        <li
                          key={course.id}
                          className="rounded-xl border border-gray-100 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-[var(--color-pmb-green-900)]">
                                {isPackagePurchase
                                  ? course.packageName
                                  : course.courseName}
                              </div>
                              {isPackagePurchase && (
                                <div className="mt-0.5 text-[10px] text-gray-500">
                                  Pacote
                                  {course.packageCourseCount
                                    ? ` com ${course.packageCourseCount} cursos`
                                    : ""}
                                </div>
                              )}
                              {!course.packagePrimary && course.packageName && (
                                <div className="mt-0.5 text-[10px] text-gray-500">
                                  Incluído no pacote {course.packageName}
                                </div>
                              )}
                              {course.bundleCourseCount && (
                                <div className="mt-0.5 text-[10px] text-gray-500">
                                  Venda com {course.bundleCourseCount} cursos
                                </div>
                              )}
                              {course.bundleOfCourseName && (
                                <div className="mt-0.5 text-[10px] text-gray-500">
                                  Incluído na venda de {course.bundleOfCourseName}
                                </div>
                              )}
                            </div>
                            <span className="font-mono text-xs text-gray-500">
                              {formatCurrency(course.amount)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                            <span>Matriculado em {formatDate(course.createdAt)}</span>
                            <SaleStatusBadge status={course.status} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  Enviar mensagem
                </h3>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Digite uma mensagem para o aluno..."
                  className="mt-2 w-full rounded-md border border-gray-200 p-2 text-sm focus:border-[var(--color-pmb-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-gold)]"
                />
                {sendResult && (
                  <div
                    className={`mt-2 text-xs ${
                      sendResult.type === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {sendResult.text}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendMessage}
                  disabled={sending || message.trim().length === 0}
                  className="mt-2 w-full"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {sending ? "Enviando..." : "Enviar mensagem"}
                </Button>
              </div>
            </>
          )}
        </div>

        {student && (
          <footer className="space-y-3 border-t border-gray-200 px-6 py-4">
            <ImpersonateButton
              endpoint={`/api/painel/alunos/${student.id}/impersonate`}
              label="Acessar como aluno"
              fallbackRedirect="/aluno"
            />
            <Button
              type="button"
              variant="outline"
              disabled={toggling}
              onClick={handleToggleBlock}
              className={`w-full ${
                isBlocked
                  ? "border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                  : "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              }`}
            >
              {isBlocked ? (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  {toggling ? "Processando..." : "Desbloquear aluno"}
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  {toggling ? "Processando..." : "Bloquear aluno"}
                </>
              )}
            </Button>
          </footer>
        )}
      </aside>
    </div>
  )
}
