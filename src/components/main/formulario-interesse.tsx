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

export function FormularioInteresse({
  initialRef = "",
}: {
  initialRef?: string
}) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" })
  const [errors, setErrors] = useState<FormErrors>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setState({ kind: "submitting" })

    const form = event.currentTarget
    const formData = new FormData(form)
    const ref = String(formData.get("ref") ?? "").trim()
    const body = {
      email: String(formData.get("email") ?? ""),
      companyName: String(formData.get("nome") ?? ""),
      phone: String(formData.get("telefone") ?? ""),
      source: "/seja-revendedor",
      ...(ref ? { ref } : {}),
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
    <section
      id="formulario"
      className="relative overflow-hidden bg-[var(--color-pmb-green-900)]"
    >
      <div
        aria-hidden
        data-parallax="50"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 100%, rgba(192,217,4,0.3) 0%, transparent 40%), radial-gradient(circle at 80% 0%, rgba(242,183,5,0.25) 0%, transparent 40%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6 lg:pr-8" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-yellow-300">
              Último passo
            </p>
            <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white md:text-6xl">
              Pronto pra prosperar no
              <br />
              <span className="italic text-yellow-300">
                mercado da educação?
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base text-white/85 md:text-lg">
              Preenche o formulário e descubra como ter o seu site
              personalizado de cursos profissionalizantes. Em até 1 dia útil,
              alguém do nosso time te chama no WhatsApp.
            </p>

            <ul className="mt-10 space-y-3 text-sm text-white/80" data-stagger>
              <li className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-yellow-300">
                  ✓
                </span>
                Conversa por WhatsApp, no seu tempo
              </li>
              <li className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-yellow-300">
                  ✓
                </span>
                Sem cobrança, sem compromisso
              </li>
              <li className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-yellow-300">
                  ✓
                </span>
                Os seus dados ficam só com a gente
              </li>
            </ul>
          </div>

          <div className="lg:col-span-6" data-reveal data-reveal-delay="0.15">
            <div className="rounded-3xl bg-white p-7 md:p-10">
              {state.kind === "success" ? (
                <div className="py-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-2xl font-black tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
                    Recebemos os seus dados.
                  </h3>
                  <p className="mt-3 text-gray-600">
                    Alguém do nosso time vai te chamar no WhatsApp em até 1
                    dia útil. Fique de olho.
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
                <form
                  className="space-y-5"
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--color-pmb-green)]">
                    Leva 30 segundos
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="nome">Seu nome</Label>
                    <Input
                      id="nome"
                      name="nome"
                      type="text"
                      placeholder="Ex: Maria da Silva"
                      required
                      aria-invalid={Boolean(errors.companyName)}
                    />
                    {errors.companyName && (
                      <p className="text-xs text-rose-600">
                        {errors.companyName}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Seu e-mail</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="voce@email.com"
                      required
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && (
                      <p className="text-xs text-rose-600">{errors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">
                      Seu WhatsApp (com DDD)
                    </Label>
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

                  <div className="space-y-2">
                    <Label htmlFor="ref">
                      Código de indicação{" "}
                      <span className="font-normal text-gray-400">
                        (opcional)
                      </span>
                    </Label>
                    <Input
                      id="ref"
                      name="ref"
                      type="text"
                      placeholder="Ex: NOME-1A2B"
                      defaultValue={initialRef}
                      autoCapitalize="characters"
                      className="uppercase"
                    />
                    <p className="text-[11px] text-gray-400">
                      Recebeu uma indicação de um revendedor? Informe o código
                      dele aqui.
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
                    className="h-13 w-full bg-[var(--color-pmb-green)] text-base font-bold text-white transition-transform hover:scale-[1.01] hover:bg-[var(--color-pmb-green-700)]"
                    disabled={state.kind === "submitting"}
                  >
                    {state.kind === "submitting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Quero que me chamem no WhatsApp
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
