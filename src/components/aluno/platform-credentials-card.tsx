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
  login: string
  /** Senha inicial; null quando não temos o valor (usar a recebida por email). */
  senha: string | null
  /** URL da tela de login da plataforma de aulas. */
  loginUrl: string | null
  /**
   * Nome do curso. Quando informado (credencial do LMS por curso), vira o título
   * do card. Sem ele (credencial global da EA) usa o título genérico.
   */
  courseName?: string
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
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/30 text-white/90 transition-colors hover:bg-white/10"
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
 * Card "Seu acesso à plataforma de aulas" exibido na área do aluno após o
 * pagamento. Mostra usuário + senha inicial (mascarada, com revelar/copiar) e
 * o botão que leva direto à tela de login da plataforma.
 */
export function PlatformCredentialsCard({
  login,
  senha,
  loginUrl,
  courseName,
}: Props) {
  const [show, setShow] = useState(false)

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-pmb-green)]/20 bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)] p-6 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green-900)]">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-pmb-lime)]">
            Acesso à plataforma de aulas
          </p>
          <h2 className="text-lg font-semibold">
            {courseName ?? "Seu usuário e senha"}
          </h2>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/85">
        Use o usuário e a senha abaixo para entrar na <strong>plataforma de
        aulas</strong> — é lá que ficam os vídeos e as atividades dos seus
        cursos. Esta área continua sendo a sua central para matrículas,
        faturas e certificados.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {/* Usuário */}
        <div className="rounded-xl bg-white/10 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
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
        <div className="rounded-xl bg-white/10 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            <KeyRound className="h-3.5 w-3.5" /> Senha inicial
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 text-white/90 transition-colors hover:bg-white/10"
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
            <p className="mt-1 text-sm text-white/80">
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
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-pmb-green)] shadow-sm transition-transform hover:translate-x-0.5 sm:w-auto"
        >
          Acessar plataforma de aulas
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <p className="mt-3 text-[11px] text-white/70">
        Esta é a senha inicial. Se você alterá-la dentro da plataforma, use a
        nova senha — este painel mostra apenas a senha original.
      </p>
    </section>
  )
}
