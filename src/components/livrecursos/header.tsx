import Link from "next/link"

export function LivrecursosHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        <Link href="/" className="text-lg font-black tracking-tight text-[var(--color-pmb-green-900)]">
          Livre<span className="text-[var(--color-pmb-green)]">Cursos</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-gray-700">
          <Link href="#beneficios" className="hover:text-[var(--color-pmb-green)]">
            Como funciona
          </Link>
          <Link href="#planos" className="hover:text-[var(--color-pmb-green)]">
            Planos
          </Link>
          <Link
            href="#cadastro"
            className="rounded-lg bg-[var(--color-pmb-gold)] px-4 py-2 text-[var(--color-pmb-green-900)] transition-colors hover:brightness-105"
          >
            Quero ser revendedor
          </Link>
        </nav>
      </div>
    </header>
  )
}
