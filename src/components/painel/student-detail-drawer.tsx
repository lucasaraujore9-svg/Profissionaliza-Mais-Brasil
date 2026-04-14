"use client"

import { useEffect, useState } from "react"
import { X, Mail, MessageSquare, Ban, Unlock, Phone, IdCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StudentStatus } from "./student-table"

interface EnrollmentDetail {
  id: string
  courseName: string
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

const statusLabels: Record<StudentStatus, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  BLOQUEADO: "Bloqueado",
  DEVEDOR: "Devedor",
  FORMADO: "Formado",
  INTERESSADO: "Interessado",
}

const statusColors: Record<StudentStatus, string> = {
  ATIVO: "bg-green-100 text-green-700",
  INATIVO: "bg-gray-100 text-gray-600",
  BLOQUEADO: "bg-red-100 text-red-700",
  DEVEDOR: "bg-amber-100 text-amber-700",
  FORMADO: "bg-blue-100 text-blue-700",
  INTERESSADO: "bg-violet-100 text-violet-700",
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
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-[#1A1A2E]">
            Detalhes do aluno
          </h2>
          <button
            type="button"
            onClick={onClose}
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
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                  {initials(student.nome)}
                </div>
                <div>
                  <div className="text-base font-semibold text-[#1A1A2E]">
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
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[student.status]}`}
                  >
                    {statusLabels[student.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-center">
                <div>
                  <div className="font-mono text-lg font-bold text-[#1A1A2E]">
                    {student.enrollments.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Cursos
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-[#1A1A2E]">
                    {formatDate(student.createdAt)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Desde
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg font-bold text-[#1A1A2E]">
                    {formatCurrency(student.totalPaid)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Valor total
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">Cursos</h3>
                {student.enrollments.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-white p-4 text-center text-xs text-gray-500">
                    Nenhum curso matriculado.
                  </div>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {student.enrollments.map((course) => (
                      <li
                        key={course.id}
                        className="rounded-xl border border-gray-100 bg-white p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-[#1A1A2E]">
                            {course.courseName}
                          </div>
                          <span className="font-mono text-xs text-gray-500">
                            {formatCurrency(course.amount)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                          <span>Matriculado em {formatDate(course.createdAt)}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
                            {course.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">
                  Enviar mensagem
                </h3>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Digite uma mensagem para o aluno..."
                  className="mt-2 w-full rounded-md border border-gray-200 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          <footer className="border-t border-gray-200 px-6 py-4">
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
