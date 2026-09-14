"use client"

import { useEffect } from "react"

/**
 * Tira da tela o aparelho cuja sessão caiu porque a conta entrou em outro (um
 * acesso por vez).
 *
 * Confere ao voltar para a aba e a cada minuto enquanto ela está visível. Aba em
 * segundo plano não consulta: não há quem ver o aviso, e a checagem roda de novo
 * no instante em que ela volta.
 */
const INTERVALO_MS = 60_000

export function StudentSessionWatch() {
  useEffect(() => {
    let parado = false

    async function conferir() {
      if (parado || document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/aluno/sessao", {
          credentials: "same-origin",
          cache: "no-store",
        })
        if (res.status !== 401) return
        const body = (await res.json().catch(() => ({}))) as { code?: string }
        parado = true
        window.location.assign(
          body.code === "SESSION_REPLACED" ? "/login?motivo=outro-acesso" : "/login",
        )
      } catch {
        // Offline ou servidor fora: não é motivo para expulsar ninguém.
      }
    }

    const timer = window.setInterval(conferir, INTERVALO_MS)
    document.addEventListener("visibilitychange", conferir)
    window.addEventListener("focus", conferir)
    return () => {
      parado = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", conferir)
      window.removeEventListener("focus", conferir)
    }
  }, [])

  return null
}
