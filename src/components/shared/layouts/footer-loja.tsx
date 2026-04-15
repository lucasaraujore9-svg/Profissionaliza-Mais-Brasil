import Image from "next/image"
import Link from "next/link"

interface FooterLojaProps {
  tenantName?: string
}

export function FooterLoja({ tenantName }: FooterLojaProps) {
  return (
    <footer className="bg-[var(--color-pmb-green)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <p className="text-sm text-white/80">
            &copy; {new Date().getFullYear()} {tenantName ?? "Cursos Online"}. Todos os direitos reservados.
          </p>

          <Link
            href="https://profissionalizamaisbrasil.com.br"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)] transition-colors"
          >
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={120}
              height={36}
              className="h-7 w-auto"
            />
            <span className="hidden sm:inline">Powered by Profissionaliza Mais Brasil</span>
            <span className="sm:hidden">Powered by PMB</span>
          </Link>
        </div>
      </div>
    </footer>
  )
}
