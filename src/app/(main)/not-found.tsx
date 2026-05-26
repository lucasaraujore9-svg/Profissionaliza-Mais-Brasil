import Link from "next/link"

export default function MainNotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground">
        A página que você procurava não existe.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar ao início
        </Link>
        <Link
          href="/cursos"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
        >
          Ver cursos
        </Link>
      </div>
    </div>
  )
}
