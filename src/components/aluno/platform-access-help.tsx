"use client"

import { useState } from "react"
import Link from "next/link"
import { KeyRound, Mail, ArrowRight } from "lucide-react"

/**
 * "Não consigo entrar na plataforma de aulas" — bloco de recuperação de acesso
 * exibido no perfil do aluno.
 *
 * Substituiu o antigo formulário de "redefinir senha da plataforma": a API da
 * fornecedora EA não permite trocar a senha do aluno (`usuarios/editar` não tem
 * o campo `senha`), então aquele formulário sempre respondia "sucesso" sem
 * mudar nada — e ainda gravava no nosso banco uma senha inexistente, quebrando a
 * única via de acesso que funcionava.
 *
 * O que funciona de verdade: a senha atual fica visível na área do aluno, e
 * daqui o aluno pode pedir o reenvio dos dados de acesso por e-mail (que também
 * ressincroniza a senha exibida com a que vale na plataforma).
 *
 * Copy: nada de dizer ao aluno que algo do fornecedor "não funciona" — o
 * "Esqueci minha senha" de lá é um canal de atendimento válido. Aqui a gente
 * oferece o caminho rápido, sem depreciar o parceiro.
 */
export function PlatformAccessHelp() {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function resend() {
    setError(null)
    setSentTo(null)
    setSending(true)
    try {
      const res = await fetch("/api/aluno/credenciais-plataforma", {
        method: "POST",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Não foi possível enviar agora. Tente de novo.")
        return
      }
      setSentTo(body.data?.email ?? null)
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente de novo.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Não consigo entrar na plataforma de aulas
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">
            A senha das aulas é definida pela plataforma e não pode ser trocada
            por aqui — mas você sempre consegue vê-la.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--color-pmb-green)]/20 bg-[var(--color-pmb-lime-50)] px-4 py-3">
        <p className="text-xs leading-relaxed text-[var(--color-pmb-green-900)]">
          Sua senha das aulas fica sempre disponível na sua área do aluno. Se
          preferir, clique em <strong>reenviar por e-mail</strong> e mandamos
          seus dados de acesso agora. Na tela da plataforma de aulas, o{" "}
          <strong>“Esqueci minha senha”</strong> abre um atendimento por
          WhatsApp, caso queira falar com alguém.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link
          href="/aluno"
          className="inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-[var(--color-pmb-green-900)] transition-colors hover:bg-gray-50"
        >
          Ver minha senha atual
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>

        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          <Mail className="h-4 w-4 shrink-0" />
          {sending ? "Enviando..." : "Reenviar por e-mail"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {sentTo && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Enviamos seus dados de acesso para <strong>{sentTo}</strong>. Por
          segurança a senha não vai por e-mail — ela fica na sua área do aluno,
          no card de acesso à plataforma de aulas.
        </p>
      )}
    </section>
  )
}
