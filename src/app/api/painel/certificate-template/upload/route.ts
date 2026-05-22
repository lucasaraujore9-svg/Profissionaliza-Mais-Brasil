import { NextResponse } from "next/server"

/**
 * Endpoint descontinuado.
 *
 * Unidades nao fazem upload de imagens para o certificado. A logo e puxada
 * automaticamente de `tenant.logoUrl` (configurada na vitrine), e os demais
 * elementos visuais (cores, textos, selo, assinatura) sao padronizados pela
 * PMB. Veja `resolveCertificateTemplate` em `src/lib/certificates/template-resolver.ts`.
 */
function gone() {
  return NextResponse.json(
    {
      error:
        "Endpoint descontinuado. Unidades nao fazem upload de imagens do certificado — a logo e puxada da vitrine.",
    },
    { status: 410 },
  )
}

export async function POST() {
  return gone()
}

export async function DELETE() {
  return gone()
}

export async function GET() {
  return gone()
}
