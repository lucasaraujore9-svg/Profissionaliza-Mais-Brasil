import { CouponGrid } from "@/components/painel/coupon-grid"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"

export default async function PainelCuponsPage() {
  const ctx = await requirePainelPage("cupons.view")

  // Loja sem gateway conectado: o cupom vale, mas só o de 100% fecha matrícula
  // (ver src/lib/checkout/sale-gateway.ts). O aviso na tela evita a unidade
  // criar um cupom parcial achando que está vendendo.
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      salesGateway: true,
      asaasConnected: true,
      mpAccessToken: true,
      mpPublicKey: true,
    },
  })

  return (
    <div className="space-y-6">
      <CouponGrid
        checkoutUnavailable={
          tenant ? tenantCheckoutMode(tenant) === "NONE" : false
        }
      />
    </div>
  )
}
