"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, type FormEvent } from "react"
import { signIn } from "next-auth/react"
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reset = searchParams.get("reset") === "1"
  const [state, setState] = useState<SubmitState>({ kind: "idle" })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ kind: "submitting" })

    const form = event.currentTarget
    const formData = new FormData(form)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (!result || result.error) {
      setState({
        kind: "error",
        message: "Email ou senha inválidos.",
      })
      return
    }

    // Fetch session para descobrir role e redirecionar
    try {
      const res = await fetch("/api/auth/session")
      const session = (await res.json()) as {
        user?: { role?: string }
      }
      const role = session.user?.role
      if (role === "SUPER_ADMIN" || role === "PMB_SALES" || role === "PMB_RESELLER_MGR") {
        router.push("/admin")
      } else if (role === "RESELLER") {
        router.push("/painel")
      } else {
        router.push("/")
      }
    } catch {
      router.push("/")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {reset && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Senha redefinida com sucesso. Faça login com sua nova senha.
        </div>
      )}

      <div>
        <Label htmlFor="email">Email</Label>
        <div className="relative mt-1.5">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="voce@empresa.com"
            className="pl-9"
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-700)]"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Sua senha"
            className="pl-9"
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-gold)]"
        />
        Lembrar-me neste dispositivo
      </label>

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
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-gray-600">
        Ainda não tem conta?{" "}
        <Link
          href="/seja-revendedor"
          className="font-medium text-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-700)]"
        >
          Seja revendedor
        </Link>
      </p>
    </form>
  )
}
