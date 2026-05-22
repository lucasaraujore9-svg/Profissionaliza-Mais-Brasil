import { NextResponse } from "next/server"

// Endpoint descontinuado — pagamento agora e automatico no dia X do mes seguinte.
// Mantido para nao quebrar clientes antigos.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Pagamentos agora sao automaticos no dia configurado do mes seguinte. Cadastre seu PIX em Configuracoes.",
      code: "AUTO_PAYOUT",
    },
    { status: 410 },
  )
}
