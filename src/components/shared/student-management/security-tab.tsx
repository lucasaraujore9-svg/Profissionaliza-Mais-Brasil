"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Ban, Unlock } from "lucide-react"
import type { ManagementScope, StudentData } from "./types"
import { apiBase } from "./types"

export function SecurityTab({
  student,
  scope,
}: {
  student: StudentData
  scope: ManagementScope
}) {
  const router = useRouter()
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<{
    ok: boolean
    text: string
    tempPassword?: string
  } | null>(null)
  const [blocking, setBlocking] = useState(false)
  const isBlocked = student.status === "BLOQUEADO"

  async function handleResetPassword() {
    if (!confirm("Resetar a senha do aluno? Uma senha temporária será enviada por email.")) return
    setResetting(true)
    setResetResult(null)
    try {
      const res = await fetch(`${apiBase(scope, student.id)}/reset-password`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResetResult({ ok: false, text: data.error ?? "Falha ao resetar" })
      } else {
        setResetResult({
          ok: true,
          text: data.emailSent
            ? "Senha resetada e email enviado ao aluno."
            : "Senha resetada. Email não pôde ser enviado — copie a senha abaixo e entregue ao aluno.",
          tempPassword: data.tempPassword,
        })
        router.refresh()
      }
    } catch {
      setResetResult({ ok: false, text: "Erro de rede" })
    } finally {
      setResetting(false)
    }
  }

  async function handleToggleBlock() {
    const action = isBlocked ? "desbloquear" : "bloquear"
    if (!confirm(`Tem certeza que deseja ${action} este aluno na plataforma de aulas?`)) {
      return
    }
    setBlocking(true)
    try {
      const res = await fetch(`${apiBase(scope, student.id)}/${action}`, {
        method: "POST",
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? `Falha ao ${action}`)
      }
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Senha de acesso ao painel
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Reseta a senha do aluno no painel <code>/aluno</code>. Gera uma senha
          temporária aleatória, envia por email e força a troca no próximo
          login. <strong>Não afeta a senha da plataforma de aulas.</strong>
        </p>

        {resetResult && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-xs ${
              resetResult.ok
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
            }`}
          >
            <p>{resetResult.text}</p>
            {resetResult.tempPassword && (
              <p className="mt-2 font-mono text-sm font-bold">
                Senha temporária: <code>{resetResult.tempPassword}</code>
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetting || !student.email}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green)] shadow-sm hover:bg-[var(--color-pmb-lime-50)] disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {resetting ? "Resetando..." : "Resetar senha"}
          </button>
          {!student.email && (
            <p className="mt-2 text-xs text-rose-600">
              Aluno sem email cadastrado — não é possível enviar a senha.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <Unlock className="h-4 w-4 text-emerald-600" />
          ) : (
            <Ban className="h-4 w-4 text-rose-600" />
          )}
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {isBlocked
              ? "Desbloquear acesso na plataforma"
              : "Bloquear acesso na plataforma"}
          </h2>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {isBlocked
            ? "Restaura o acesso do aluno às aulas e libera a apostila."
            : "Bloqueia o aluno na plataforma de aulas (apostila e acesso). Não cancela matrículas nem afeta a cobrança."}
        </p>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleToggleBlock}
            disabled={blocking}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50 ${
              isBlocked
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            {isBlocked ? (
              <>
                <Unlock className="h-4 w-4" />
                {blocking ? "Desbloqueando..." : "Desbloquear aluno"}
              </>
            ) : (
              <>
                <Ban className="h-4 w-4" />
                {blocking ? "Bloqueando..." : "Bloquear aluno"}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
