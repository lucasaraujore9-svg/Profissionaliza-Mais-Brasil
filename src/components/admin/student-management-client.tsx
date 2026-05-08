"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface EnrollmentItem {
  id: string
  courseId: string
  courseName: string
  status: string
  paymentType: string
  gateway: string
  originalAmount: number
  discountAmount: number
  finalAmount: number
  installmentsTotal: number | null
  installmentsPaid: number
  asaasPaymentId: string | null
  asaasSubscriptionId: string | null
  asaasInvoiceUrl: string | null
  mpPreferenceId: string | null
  mpSubscriptionId: string | null
  externalReference: string | null
  startedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface StudentData {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
  status: string
  apostila: string
  eaAlunoId: string | null
  asaasCustomerId: string | null
  createdAt: string
  enrollments: EnrollmentItem[]
}

interface Props {
  student: StudentData
  role: "SUPER_ADMIN" | "PMB_SALES" | string
}

type CancelMode = "charge-only" | "remove-ea"

interface CancelDialogState {
  open: boolean
  enrollmentId: string | null
}

function statusBadgeVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "ACTIVE") return "default"
  if (status === "CANCELLED") return "destructive"
  if (status === "SUSPENDED") return "secondary"
  return "outline"
}

function studentStatusBadgeVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "ATIVO") return "default"
  if (status === "BLOQUEADO") return "destructive"
  return "outline"
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

function gatewayLabel(gateway: string): string {
  if (gateway === "ASAAS") return "Asaas"
  if (gateway === "MP") return "Mercado Pago"
  return gateway
}

function paymentTypeLabel(type: string): string {
  if (type === "ONE_TIME") return "Único"
  if (type === "INSTALLMENTS") return "Parcelado"
  if (type === "SUBSCRIPTION") return "Assinatura"
  return type
}

export function StudentManagementClient({ student: initialStudent, role }: Props) {
  const router = useRouter()
  const [student, setStudent] = useState<StudentData>(initialStudent)
  const [isPending, startTransition] = useTransition()
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cancelDialog, setCancelDialog] = useState<CancelDialogState>({ open: false, enrollmentId: null })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function performAction(
    key: string,
    url: string,
    options?: RequestInit,
  ): Promise<{ ok: boolean; error?: string }> {
    setActionLoading(key)
    setErrorMsg(null)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...options,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: (body as { error?: string }).error ?? `Erro ${res.status}` }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: "Erro de rede" }
    } finally {
      setActionLoading(null)
    }
  }

  function refreshStudent() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleBlockStudent() {
    const result = await performAction(
      "block",
      `/api/admin/alunos/${student.id}/bloquear`,
    )
    if (!result.ok) {
      setErrorMsg(result.error ?? "Falha ao bloquear")
    } else {
      setStudent((prev) => ({ ...prev, status: "BLOQUEADO", apostila: "BLOQUEADA" }))
      refreshStudent()
    }
  }

  async function handleUnblockStudent() {
    const result = await performAction(
      "unblock",
      `/api/admin/alunos/${student.id}/desbloquear`,
    )
    if (!result.ok) {
      setErrorMsg(result.error ?? "Falha ao desbloquear")
    } else {
      setStudent((prev) => ({ ...prev, status: "ATIVO", apostila: "LIBERADA" }))
      refreshStudent()
    }
  }

  async function handleSync(enrollmentId: string) {
    const result = await performAction(
      `sync-${enrollmentId}`,
      `/api/admin/vendas/${enrollmentId}/sync-payment`,
    )
    if (!result.ok) {
      setErrorMsg(result.error ?? "Falha ao sincronizar")
    } else {
      refreshStudent()
    }
  }

  function openCancelDialog(enrollmentId: string) {
    setCancelDialog({ open: true, enrollmentId })
  }

  function closeCancelDialog() {
    setCancelDialog({ open: false, enrollmentId: null })
  }

  async function handleCancel(mode: CancelMode) {
    const { enrollmentId } = cancelDialog
    if (!enrollmentId) return
    closeCancelDialog()

    const removeFromEA = mode === "remove-ea"
    const result = await performAction(
      `cancel-${enrollmentId}`,
      `/api/admin/alunos/${student.id}/enrollments/${enrollmentId}/cancelar`,
      {
        body: JSON.stringify({ removeFromEA }),
      },
    )
    if (!result.ok) {
      setErrorMsg(result.error ?? "Falha ao cancelar")
    } else {
      setStudent((prev) => ({
        ...prev,
        enrollments: prev.enrollments.map((e) =>
          e.id === enrollmentId ? { ...e, status: "CANCELLED" } : e,
        ),
      }))
      refreshStudent()
    }
  }

  const isBlockLoading = actionLoading === "block"
  const isUnblockLoading = actionLoading === "unblock"

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
          <button
            className="ml-3 underline"
            onClick={() => setErrorMsg(null)}
          >
            Fechar
          </button>
        </div>
      )}

      {/* Student info grid */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="bg-[var(--color-pmb-mist)] px-4 py-3">
          <h2 className="font-semibold text-sm text-[var(--color-pmb-green-900)]">
            Informações do aluno
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 p-4 sm:grid-cols-3">
          <InfoField label="Email" value={student.email} />
          <InfoField label="CPF" value={student.cpf} />
          <InfoField label="Telefone" value={student.fone} />
          <InfoField label="ID plataforma EA" value={student.eaAlunoId} />
          <InfoField label="ID Asaas" value={student.asaasCustomerId} />
          <InfoField label="Cadastro" value={formatDate(student.createdAt)} />
          <InfoField label="Apostila" value={student.apostila} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/admin/vendas/nova?studentId=${student.id}`}
          className="inline-flex items-center rounded-md border border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Vender novo curso →
        </Link>

        {role === "SUPER_ADMIN" && (
          <>
            <button
              disabled={isBlockLoading || isPending}
              onClick={handleBlockStudent}
              className="inline-flex items-center rounded-md border border-orange-200 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-50"
            >
              {isBlockLoading ? "Bloqueando…" : "Bloquear EA"}
            </button>

            <button
              disabled={isUnblockLoading || isPending}
              onClick={handleUnblockStudent}
              className="inline-flex items-center rounded-md border border-green-200 px-3 py-2 text-sm text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              {isUnblockLoading ? "Desbloqueando…" : "Desbloquear EA"}
            </button>
          </>
        )}
      </div>

      {/* Enrollments table */}
      <div>
        <h2 className="mb-3 font-semibold text-[var(--color-pmb-green-900)]">
          Matrículas
        </h2>

        {student.enrollments.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
            Nenhuma matrícula encontrada
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-pmb-mist)] text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Curso</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Gateway</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {student.enrollments.map((e) => {
                  const isCancelLoading = actionLoading === `cancel-${e.id}`
                  const isSyncLoading = actionLoading === `sync-${e.id}`
                  const isAnyLoading = actionLoading !== null || isPending

                  return (
                    <tr key={e.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{e.courseName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {paymentTypeLabel(e.paymentType)}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(e.finalAmount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(e.status)}>
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {gatewayLabel(e.gateway)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {e.status === "PENDING" && (
                            <button
                              disabled={isAnyLoading}
                              onClick={() => handleSync(e.id)}
                              className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              {isSyncLoading ? "Sincronizando…" : "Sync"}
                            </button>
                          )}

                          {e.asaasInvoiceUrl && (
                            <a
                              href={e.asaasInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
                            >
                              Ver fatura
                            </a>
                          )}

                          {(e.status === "PENDING" || e.status === "ACTIVE" || e.status === "SUSPENDED") && (
                            <button
                              disabled={isAnyLoading}
                              onClick={() => openCancelDialog(e.id)}
                              className="inline-flex items-center rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {isCancelLoading ? "Cancelando…" : "Cancelar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel confirmation dialog */}
      {cancelDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-[var(--color-pmb-green-900)]">
              Cancelar matrícula
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Escolha como deseja cancelar esta matrícula:
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleCancel("charge-only")}
                className="w-full rounded-md border border-orange-200 px-4 py-2.5 text-left text-sm hover:bg-orange-50"
              >
                <span className="font-medium text-orange-700">Cancelar cobrança apenas</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cancela o pagamento/assinatura no gateway. O aluno mantém acesso à plataforma de aulas.
                </p>
              </button>
              <button
                onClick={() => handleCancel("remove-ea")}
                className="w-full rounded-md border border-red-200 px-4 py-2.5 text-left text-sm hover:bg-red-50"
              >
                <span className="font-medium text-red-700">
                  Cancelar e remover acesso à plataforma
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cancela a cobrança e desvincula o curso na plataforma de aulas (EA).
                </p>
              </button>
              <button
                onClick={closeCancelDialog}
                className="w-full rounded-md border px-4 py-2.5 text-sm text-muted-foreground hover:bg-gray-50"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  )
}
