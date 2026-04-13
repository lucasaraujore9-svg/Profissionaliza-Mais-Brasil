import Link from "next/link"

export function FooterMain() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-bold text-gray-900">
              Profissionaliza <span className="text-blue-600">Mais Brasil</span>
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Plataforma de revenda de cursos profissionalizantes online.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Links</p>
            <nav className="mt-3 flex flex-col gap-2 text-sm text-gray-600">
              <Link href="/#como-funciona" className="hover:text-gray-900">
                Como Funciona
              </Link>
              <Link href="/seja-revendedor" className="hover:text-gray-900">
                Seja Revendedor
              </Link>
              <Link href="/login" className="hover:text-gray-900">
                Login
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Legal</p>
            <nav className="mt-3 flex flex-col gap-2 text-sm text-gray-600">
              <Link href="/termos" className="hover:text-gray-900">
                Termos de Uso
              </Link>
              <Link href="/privacidade" className="hover:text-gray-900">
                Privacidade
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Profissionaliza Mais Brasil. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}
