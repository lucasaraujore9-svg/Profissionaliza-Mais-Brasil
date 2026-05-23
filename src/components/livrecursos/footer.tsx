import Link from "next/link"
import { appUrl } from "@/lib/tenant/urls"

export function LivrecursosFooter() {
  const base = appUrl()
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-gray-500 md:flex-row md:px-6">
        <p>
          © {new Date().getFullYear()} Livre Cursos. Plataforma de revenda da{" "}
          <Link
            href={base}
            className="font-medium text-[var(--color-pmb-green)] hover:underline"
          >
            Profissionaliza Mais Brasil
          </Link>
          .
        </p>
        <div className="flex gap-4">
          <Link
            href={`${base}/termos`}
            className="hover:text-[var(--color-pmb-green)]"
          >
            Termos
          </Link>
          <Link
            href={`${base}/privacidade`}
            className="hover:text-[var(--color-pmb-green)]"
          >
            Privacidade
          </Link>
        </div>
      </div>
    </footer>
  )
}
