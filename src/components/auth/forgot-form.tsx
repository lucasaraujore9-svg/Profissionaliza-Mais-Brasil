"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Mail, ArrowLeft, Send, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string }

export function ForgotForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ kind: "submitting" })

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "")

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        setState({
          kind: "error",
          message: "Erro ao solicitar. Tente novamente.",
        })
        return
      }
      setState({ kind: "success" })
    } catch {
      setState({
        kind: "error",
        message: "Erro de rede. Tente novamente.",
      })
    }
  }

  if (state.kind === "success") {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
            Verifique seu email
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Se este email estiver cadastrado, você receberá um link para redefinir
            sua senha em até 5 minutos.
          </p>
        </div>
        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[var(--color-pmb-green-900)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="email">Email cadastrado</Label>
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
        <p className="mt-2 text-xs text-gray-500">
          Enviaremos um link para redefinir sua senha em instantes.
        </p>
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
            Enviando...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Enviar link de redefinição
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
