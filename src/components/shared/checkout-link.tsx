"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

/**
 * Botão para copiar/abrir o link de checkout de uma cobrança pendente, para que
 * admin (sistema mãe) ou revenda reenviem ao aluno (venda direta aguardando
 * pagamento ou carrinho abandonado). Reusado na aba financeira do aluno e nas
 * listas de vendas diretas (/painel/vendas, /admin/vendas).
 */
export function CheckoutLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title={url}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition ${
          copied
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-white text-[var(--color-pmb-green-900)] ring-gray-200 hover:bg-gray-50"
        }`}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copiado" : "Copiar link"}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir checkout"
        className="inline-flex items-center rounded-md bg-white px-1.5 py-1 text-gray-500 ring-1 ring-gray-200 transition hover:bg-gray-50 hover:text-[var(--color-pmb-green-900)]"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}

export default CheckoutLink
