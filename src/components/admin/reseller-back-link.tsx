import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface ResellerBackLinkProps {
  href: string
  label: string
}

/**
 * Link "voltar" padronizado para as paginas de revenda (detalhe + comissoes).
 */
export function ResellerBackLink({ href, label }: ResellerBackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 transition-colors hover:text-[var(--color-pmb-green-700)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}
