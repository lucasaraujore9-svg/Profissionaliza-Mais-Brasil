import Link from "next/link"
import Image from "next/image"

export const metadata = {
  title: "Página não encontrada — Profissionaliza Mais Brasil",
  description: "O endereço que você tentou abrir não existe ou foi movido.",
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-pmb-mist)] px-6 py-16 text-center">
      <Link href="/" aria-label="Profissionaliza Mais Brasil">
        <Image
          src="/images/logo.png"
          alt="Profissionaliza Mais Brasil"
          width={300}
          height={80}
          className="h-12 w-auto"
          priority
        />
      </Link>

      <p className="mt-10 text-5xl font-black text-[var(--color-pmb-green)]">
        404
      </p>
      <h1 className="mt-4 max-w-xl text-2xl font-bold text-[var(--color-pmb-green-900)] md:text-3xl">
        Não encontramos esta página
      </h1>
      <p className="mt-3 max-w-xl text-sm text-[rgba(2,89,24,0.7)]">
        O endereço pode ter sido movido, ou você digitou algo diferente. Tente
        voltar para a página inicial ou ver nosso catálogo de cursos.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          Voltar para a home
        </Link>
        <Link
          href="/cursos"
          className="rounded-lg border border-[rgba(2,89,24,0.2)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-pmb-green)] hover:bg-white"
        >
          Ver cursos
        </Link>
      </div>
    </div>
  )
}
