import { StudentBuyClient } from "@/components/aluno/student-buy-client"

export default function StudentBuyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[var(--color-pmb-green-900)]">
          Comprar novo curso
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Escolha um curso do catálogo. O pagamento usa seus dados já cadastrados —
          basta concluir no checkout.
        </p>
      </header>
      <StudentBuyClient />
    </div>
  )
}
