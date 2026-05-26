import Link from "next/link"

export default function LojaNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Curso não encontrado</h1>
      <p className="text-muted-foreground">
        Este curso pode ter sido removido da loja ou o link está incorreto.
      </p>
      <Link
        href="/"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Voltar à loja
      </Link>
    </div>
  )
}
