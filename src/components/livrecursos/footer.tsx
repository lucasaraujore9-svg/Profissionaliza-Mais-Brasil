import Link from "next/link"

export function LivrecursosFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-gray-500 md:flex-row md:px-6">
        <p>
          © {new Date().getFullYear()} Livre Cursos. Plataforma de revenda da{" "}
          <Link
            href="https://profissionalizamaisbrasil.com.br"
            className="font-medium text-[var(--color-pmb-green)] hover:underline"
          >
            Profissionaliza Mais Brasil
          </Link>
          .
        </p>
        <div className="flex gap-4">
          <Link
            href="https://profissionalizamaisbrasil.com.br/termos"
            className="hover:text-[var(--color-pmb-green)]"
          >
            Termos
          </Link>
          <Link
            href="https://profissionalizamaisbrasil.com.br/privacidade"
            className="hover:text-[var(--color-pmb-green)]"
          >
            Privacidade
          </Link>
        </div>
      </div>
    </footer>
  )
}
