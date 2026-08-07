"use client"

import { useState } from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  UserRound,
} from "lucide-react"

interface Props {
  /** Curso a que este acesso pertence — é o título do card. */
  courseName: string
  login: string
  /** Senha inicial; null quando não temos o valor (usar a recebida por email). */
  senha: string | null
  /** Destino do botão "Acessar aulas". `null` esconde o botão. */
  loginUrl: string | null
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard indisponível (http, permissões) — ignora silenciosamente
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:bg-white"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}

/**
 * Card de acesso às aulas de UM curso, exibido na área do aluno após o
 * pagamento. Mostra usuário + senha inicial (mascarada, com revelar/copiar) e o
 * botão que abre as aulas.
 *
 * Os textos são FIXOS de propósito: o aluno tem um card por curso e todos
 * precisam ser indistinguíveis entre si. Rótulo, descrição ou botão variando por
 * curso revelaria como cada um é atendido nos bastidores — que é exatamente o
 * que esta tela não deve contar. Se precisar variar algo aqui, confirme antes
 * que a variação não decorre da origem do curso.
 */
export function PlatformCredentialsCard({
  courseName,
  login,
  senha,
  loginUrl,
}: Props) {
  const [show, setShow] = useState(false)

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-pmb-green)]/20 bg-white p-6 text-[var(--color-pmb-green-900)] shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-pmb-green)]">
            Acesso às aulas
          </p>
          <h2 className="text-lg font-semibold">
            {courseName}
          </h2>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-gray-600">
        Use o usuário e a senha abaixo para assistir às aulas deste curso.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {/* Usuário */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <UserRound className="h-3.5 w-3.5" /> Usuário
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-base font-semibold">
              {login}
            </span>
            <CopyButton value={login} label="usuário" />
          </div>
        </div>

        {/* Senha */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <KeyRound className="h-3.5 w-3.5" /> Senha
          </p>
          {senha ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-base font-semibold">
                {show ? senha : "••••••••"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:bg-white"
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <CopyButton value={senha} label="senha" />
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              Enviada para o seu e-mail.
            </p>
          )}
        </div>
      </div>

      {loginUrl && (
        <a
          href={loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)] sm:w-auto"
        >
          Acessar aulas
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <p className="mt-3 text-[11px] text-gray-500">
        Esta é a senha inicial. Se você trocá-la depois de entrar, use a nova
        senha — aqui aparece sempre a original.
      </p>
    </section>
  )
}
