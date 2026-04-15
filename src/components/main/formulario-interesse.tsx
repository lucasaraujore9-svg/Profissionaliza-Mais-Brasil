"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string }

interface FormErrors {
  email?: string
  companyName?: string
  phone?: string
}

interface ApiError {
  error?: string
  code?: string
  details?: Record<string, string[] | undefined>
}

export function FormularioInteresse() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" })
  const [errors, setErrors] = useState<FormErrors>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setState({ kind: "submitting" })

    const form = event.currentTarget
    const formData = new FormData(form)
    const body = {
      email: String(formData.get("email") ?? ""),
      companyName: String(formData.get("empresa") ?? ""),
      phone: String(formData.get("telefone") ?? ""),
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError
        if (data.code === "VALIDATION_ERROR" && data.details) {
          setErrors({
            email: data.details.email?.[0],
            companyName: data.details.companyName?.[0],
            phone: data.details.phone?.[0],
          })
          setState({ kind: "idle" })
          return
        }
        setState({
          kind: "error",
          message: data.error ?? "Falha ao enviar. Tente novamente.",
        })
        return
      }

      form.reset()
      setState({ kind: "success" })
    } catch {
      setState({
        kind: "error",
        message: "Erro de rede. Verifique sua conexão e tente novamente.",
      })
    }
  }

  return (
    <section id="formulario" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-[#FAFAFA] to-white shadow-sm">
          <div className="p-6 md:p-10 lg:p-12">
            {state.kind === "success" ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
                  Obrigado!
                </h2>
                <p className="mt-3 text-gray-600">
                  Entraremos em contato em até 1 dia útil.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6"
                  onClick={() => setState({ kind: "idle" })}
                >
                  Enviar outro contato
                </Button>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
                    Pronto pra começar?
                  </h2>
                  <p className="mt-3 text-gray-600">
                    Preencha o formulário e um consultor entra em contato pra te
                    ajudar a escolher o plano ideal.
                  </p>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email profissional</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="voce@empresa.com.br"
                      required
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && (
                      <p className="text-xs text-rose-600">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="empresa">Nome da empresa ou escola</Label>
                    <Input
                      id="empresa"
                      name="empresa"
                      type="text"
                      placeholder="Ex: Escola Excel Pro"
                      required
                      aria-invalid={Boolean(errors.companyName)}
                    />
                    {errors.companyName && (
                      <p className="text-xs text-rose-600">{errors.companyName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
                    <Input
                      id="telefone"
                      name="telefone"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      required
                      aria-invalid={Boolean(errors.phone)}
                    />
                    {errors.phone && (
                      <p className="text-xs text-rose-600">{errors.phone}</p>
                    )}
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
                        Quero Começar
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-gray-500">
                    Seus dados estão seguros. Nunca compartilhamos informações com
                    terceiros.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
