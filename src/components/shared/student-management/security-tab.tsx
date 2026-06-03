"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  KeyRound,
  Ban,
  Unlock,
  GraduationCap,
  Eye,
  EyeOff,
  Copy,
  Check,
  Mail,
  Sparkles,
  AlertTriangle,
} from "lucide-react"
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

  // O aluno só existe na plataforma de aulas depois de uma matrícula paga.
  // `pending_<timestamp>` é o placeholder antes disso.
  const onPlatform = Boolean(
    student.plataformaAlunoId &&
      !student.plataformaAlunoId.startsWith("pending"),
  )

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
      <PlatformAccessSection
        student={student}
        scope={scope}
        onPlatform={onPlatform}
      />

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

/**
 * Credenciais da plataforma de aulas (EA): ver login + senha, trocar a senha e
 * reenviar o email de credenciais (que o aluno nem sempre recebe na matrícula).
 */
function PlatformAccessSection({
  student,
  scope,
  onPlatform,
}: {
  student: StudentData
  scope: ManagementScope
  onPlatform: boolean
}) {
  const router = useRouter()
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)

  // Trocar senha
  const [showChange, setShowChange] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [changing, setChanging] = useState(false)
  const [changeResult, setChangeResult] = useState<{
    ok: boolean
    text: string
    password?: string
  } | null>(null)

  // Reenviar email
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState<{
    ok: boolean
    text: string
  } | null>(null)

  // Senha exibida: a atual carregada do banco, ou a recém-trocada.
  const currentPassword = changeResult?.password ?? student.plataformaSenha

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponível — usuário copia manualmente */
    }
  }

  async function handleChange(generate: boolean) {
    if (!generate && newPassword.trim().length < 6) {
      setChangeResult({ ok: false, text: "A senha precisa ter ao menos 6 caracteres." })
      return
    }
    setChanging(true)
    setChangeResult(null)
    try {
      const res = await fetch(`${apiBase(scope, student.id)}/plataforma-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          generate ? { generate: true } : { newPassword: newPassword.trim() },
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setChangeResult({ ok: false, text: data.error ?? "Falha ao trocar a senha" })
      } else {
        setReveal(true)
        setShowChange(false)
        setNewPassword("")
        setChangeResult({
          ok: true,
          text: "Senha alterada na plataforma de aulas. Copie e repasse ao aluno — ou reenvie o email de credenciais abaixo.",
          password: data.password,
        })
        router.refresh()
      }
    } catch {
      setChangeResult({ ok: false, text: "Erro de rede" })
    } finally {
      setChanging(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setResendResult(null)
    try {
      const res = await fetch(`${apiBase(scope, student.id)}/reenviar-email`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResendResult({ ok: false, text: data.error ?? "Falha ao reenviar o email" })
      } else {
        setResendResult({
          ok: true,
          text: "Email de credenciais reenviado pela plataforma de aulas.",
        })
      }
    } catch {
      setResendResult({ ok: false, text: "Erro de rede" })
    } finally {
      setResending(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Acesso à plataforma de aulas
        </h2>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Credenciais usadas pelo aluno para <strong>assistir às aulas</strong> na
        plataforma parceira. Aqui você vê a senha, troca quando necessário e
        reenvia o email de acesso caso o aluno não tenha recebido.
      </p>

      {!onPlatform ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Aluno ainda não está na plataforma de aulas. As credenciais são
            criadas automaticamente após a confirmação de uma matrícula paga.
          </p>
        </div>
      ) : (
        <>
          {/* Login + senha atuais */}
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Login
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-gray-800">
                {student.plataformaAlunoId}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Senha
              </dt>
              <dd className="mt-0.5 flex items-center gap-2">
                {currentPassword ? (
                  <>
                    <span className="font-mono text-sm font-semibold text-gray-800">
                      {reveal ? currentPassword : "•".repeat(currentPassword.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReveal((v) => !v)}
                      className="text-gray-400 hover:text-gray-600"
                      title={reveal ? "Ocultar" : "Mostrar"}
                    >
                      {reveal ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPassword(currentPassword)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Copiar senha"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">
                    Indisponível — defina uma nova senha abaixo.
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {changeResult && (
            <div
              className={`mt-3 rounded-md px-3 py-2 text-xs ${
                changeResult.ok
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              }`}
            >
              {changeResult.text}
            </div>
          )}

          {resendResult && (
            <div
              className={`mt-3 rounded-md px-3 py-2 text-xs ${
                resendResult.ok
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              }`}
            >
              {resendResult.text}
            </div>
          )}

          {/* Ações */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowChange((v) => !v)
                setChangeResult(null)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-pmb-green)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green)] shadow-sm hover:bg-[var(--color-pmb-lime-50)]"
            >
              <KeyRound className="h-4 w-4" />
              Trocar senha
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {resending ? "Reenviando..." : "Reenviar email de acesso"}
            </button>
          </div>

          {showChange && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="text-xs font-medium text-gray-600">
                Nova senha
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleChange(false)}
                  disabled={changing}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {changing ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => handleChange(true)}
                  disabled={changing}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                  title="Gerar uma senha aleatória"
                >
                  <Sparkles className="h-4 w-4" />
                  Gerar automática
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                A troca é aplicada na plataforma de aulas. Avise o aluno da nova
                senha ou use &quot;Reenviar email de acesso&quot;.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
