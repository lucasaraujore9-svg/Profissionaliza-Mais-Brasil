"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Lock, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }

interface ResetPasswordFormProps {
  token: string
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const [state, setState] = useState<SubmitState>({ kind: "idle" })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ kind: "submitting" })

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password") ?? "")
    const confirm = String(formData.get("confirm") ?? "")

    if (password !== confirm) {
      setState({ kind: "error", message: "As senhas não coincidem." })
      return
    }
    if (password.length < 8) {
      setState({
        kind: "error",
        message: "A senha deve ter pelo menos 8 caracteres.",
      })
      return
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        setState({
          kind: "error",
          message: data.error ?? "Erro ao redefinir senha.",
        })
        return
      }

      router.push("/login?reset=1")
    } catch {
      setState({
        kind: "error",
        message: "Erro de rede. Tente novamente.",
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="password">Nova senha</Label>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            className="pl-9"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="confirm">Confirmar senha</Label>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="confirm"
            name="confirm"
            type="password"
            placeholder="Repita a senha"
            className="pl-9"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
      </div>

      {state.kind === "error" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {state.message}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        disabled={state.kind === "submitting"}
      >
        {state.kind === "submitting" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            Redefinir senha
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para o login
      </Link>
    </form>
  )
}
