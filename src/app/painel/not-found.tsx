import Link from "next/link"

export default function PainelNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Recurso não encontrado</h1>
      <p className="text-muted-foreground">
        O item que você procurava não existe ou foi removido.
      </p>
      <Link
        href="/painel"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Voltar ao painel
      </Link>
    </div>
  )
}
