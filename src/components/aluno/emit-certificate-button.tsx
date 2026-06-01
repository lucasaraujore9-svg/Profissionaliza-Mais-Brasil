"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Award, Loader2 } from "lucide-react"

interface Props {
  enrollmentId: string
}

/**
 * Botão de auto-serviço: o aluno emite o próprio certificado quando o curso
 * está concluído. Em sucesso, redireciona para a página do certificado.
 */
export function EmitCertificateButton({ enrollmentId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/student/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId }),
      })
      const data = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null
      if (!res.ok || !data?.id) {
        setError(data?.error ?? "Não foi possível emitir o certificado.")
        setLoading(false)
        return
      }
      router.push(`/aluno/certificados/${data.id}`)
      router.refresh()
    } catch {
      setError("Falha de conexão. Tente novamente.")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-lime)] px-4 py-2.5 text-sm font-semibold text-[var(--color-pmb-green-900)] shadow-sm transition-colors hover:bg-[var(--color-pmb-lime)]/80 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Award className="h-4 w-4" />
        )}
        {loading ? "Emitindo certificado…" : "Emitir certificado"}
      </button>
      {error && (
        <p className="text-center text-[11px] text-rose-600">{error}</p>
      )}
    </div>
  )
}
