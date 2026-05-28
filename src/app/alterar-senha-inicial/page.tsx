"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Lock, ArrowRight, Loader2, ShieldCheck } from "lucide-react"

export default function AlterarSenhaInicialPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/alterar-senha-inicial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Erro ao alterar senha.")
        return
      }

      // Redireciona para login para que a sessão seja renovada com mustChangePassword=false
      router.push("/login?reset=1")
    } catch {
      setError("Erro de rede. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/images/logo.png"
            alt="Profissionaliza Mais Brasil"
            width={180}
            height={48}
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-pmb-green)]/10">
              <ShieldCheck className="h-6 w-6 text-[var(--color-pmb-green)]" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Crie sua senha de acesso
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Por segurança, você precisa criar uma senha pessoal antes de continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-gray-700"
              >
                Nova senha
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700"
              >
                Confirmar nova senha
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  Salvar senha e continuar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Esta ação é obrigatória e não pode ser pulada.
        </p>
      </div>
    </div>
  )
}
