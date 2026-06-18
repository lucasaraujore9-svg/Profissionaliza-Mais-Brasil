import { NextResponse } from "next/server"

// Endpoint descontinuado — a revenda nao solicita saque. As comissoes liberadas
// sao pagas manualmente pela equipe financeira apos conferencia (com comprovante).
// Mantido para nao quebrar clientes antigos.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Você não precisa solicitar saque. As comissões liberadas são pagas manualmente pela equipe financeira após conferência; acompanhe e baixe o comprovante em /painel/indicacoes.",
      code: "MANUAL_PAYOUT",
    },
    { status: 410 },
  )
}
