"use client"

import { useState, type FormEvent, type ChangeEvent } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { slugify } from "@/lib/utils"

// Variante do formulario de captacao usada SOMENTE na landing /lp-revenda2 (so
// no dominio PMB). Alem de nome/email/whatsapp, coleta: o subdominio (slug)
// desejado para a vitrine — auto-gerado a partir do nome e editavel —, o CPF do
// interessado e o plano (R$ 209 ou R$ 239). Tudo cai no mesmo /api/leads e
// aparece nos dados do lead de revenda.

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string }

interface FormErrors {
  email?: string
  companyName?: string
  phone?: string
  cpf?: string
  slug?: string
}

interface ApiError {
  error?: string
  code?: string
  details?: Record<string, string[] | undefined>
}

const PLANOS = [
  {
    value: "Profissionaliza (R$ 209)",
    titulo: "Profissionaliza",
    preco: "R$ 209/mês",
    descricao: "Site personalizado + mais de 100 cursos, sem comissão.",
  },
  {
    value: "Profissionaliza PRO (R$ 239)",
    titulo: "Profissionaliza PRO",
    preco: "R$ 239/mês",
    descricao: "Tudo do plano + Automação que vende no WhatsApp por você.",
  },
] as const

// CPF: 000.000.000-00
function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function FormularioInteresseRevenda2({
  initialRef = "",
}: {
  initialRef?: string
}) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" })
  const [errors, setErrors] = useState<FormErrors>({})
  const [cpf, setCpf] = useState("")
  const [slug, setSlug] = useState("")
  // Enquanto o visitante nao editar manualmente o slug, ele acompanha o nome.
  const [slugTouched, setSlugTouched] = useState(false)
  const [plano, setPlano] = useState<string>(PLANOS[0].value)

  function handleNomeChange(event: ChangeEvent<HTMLInputElement>) {
    if (!slugTouched) setSlug(slugify(event.target.value))
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    setSlugTouched(true)
    // Normaliza para o formato de subdominio enquanto digita.
    setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // O form usa noValidate (mesmo padrao da landing classica): validamos os
    // campos exclusivos desta variante no client antes de enviar.
    const cpfDigits = cpf.replace(/\D/g, "")
    const localErrors: FormErrors = {}
    if (cpfDigits.length !== 11) localErrors.cpf = "Informe um CPF válido"
    if (slug.trim().length < 3) {
      localErrors.slug = "Escolha um endereço com pelo menos 3 caracteres"
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      setState({ kind: "idle" })
      return
    }

    setErrors({})
    setState({ kind: "submitting" })

    const form = event.currentTarget
    const formData = new FormData(form)
    const ref = String(formData.get("ref") ?? "").trim()
    const body = {
      email: String(formData.get("email") ?? ""),
      companyName: String(formData.get("nome") ?? ""),
      phone: String(formData.get("telefone") ?? ""),
      cpf: cpfDigits,
      slug,
      plan: plano,
      source: "/lp-revenda2",
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
            companyName: data.details.companyName?.[0] ?? data.details.name?.[0],
            phone: data.details.phone?.[0],
            cpf: data.details.cpf?.[0],
            slug: data.details.slug?.[0],
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
      setCpf("")
      setSlug("")
      setSlugTouched(false)
      setPlano(PLANOS[0].value)
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
                    Leva 1 minuto
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="nome">Seu nome</Label>
                    <Input
                      id="nome"
                      name="nome"
                      type="text"
                      placeholder="Ex: Maria da Silva"
                      required
                      onChange={handleNomeChange}
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
                    <Label htmlFor="cpf">Seu CPF</Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      required
                      value={cpf}
                      onChange={(e) => setCpf(maskCpf(e.target.value))}
                      aria-invalid={Boolean(errors.cpf)}
                    />
                    {errors.cpf && (
                      <p className="text-xs text-rose-600">{errors.cpf}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slug">Endereço da sua vitrine</Label>
                    <div className="flex items-stretch overflow-hidden rounded-md border border-gray-200 focus-within:border-[var(--color-pmb-green)]">
                      <Input
                        id="slug"
                        name="slug"
                        type="text"
                        placeholder="sua-loja"
                        required
                        value={slug}
                        onChange={handleSlugChange}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="rounded-none border-0 focus-visible:ring-0"
                        aria-invalid={Boolean(errors.slug)}
                      />
                      <span className="flex items-center whitespace-nowrap bg-gray-50 px-3 text-sm text-gray-500">
                        .livrecursos.com.br
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Gerado a partir do seu nome — você pode editar. Letras
                      minúsculas, números e hífen.
                    </p>
                    {errors.slug && (
                      <p className="text-xs text-rose-600">{errors.slug}</p>
                    )}
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-medium text-gray-900">
                      Plano de interesse
                    </legend>
                    <div className="space-y-2">
                      {PLANOS.map((p) => {
                        const active = plano === p.value
                        return (
                          <label
                            key={p.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                              active
                                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="plan"
                              value={p.value}
                              checked={active}
                              onChange={() => setPlano(p.value)}
                              className="mt-1 accent-[var(--color-pmb-green)]"
                            />
                            <span className="flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-bold text-[var(--color-pmb-green-900)]">
                                  {p.titulo}
                                </span>
                                <span className="text-sm font-bold text-[var(--color-pmb-green)]">
                                  {p.preco}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {p.descricao}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>

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
