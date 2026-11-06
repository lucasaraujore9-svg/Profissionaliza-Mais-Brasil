import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { getSystemSettings } from "@/lib/system-settings"
import { NovaVendaClient } from "@/components/admin/nova-venda-client"
import { coursePaymentType, vitrineCoursePrice } from "@/lib/tenant/monthly-policy"
import { resolveVitrinePackages } from "@/lib/packages/vitrine"
import { resolveVitrinePlans } from "@/lib/subscriptions/plans"
import { effectiveSalesCap } from "@/lib/coupons/sales-cap"

export const dynamic = "force-dynamic"

export default async function NovaVendaPage() {
  const session = await requireAdminPage("vendas.create")

  const [courses, vitrinePackages, vitrinePlans, settings, cap] = await Promise.all([
    prisma.course.findMany({
      where: { status: "ATIVO" },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        precoVitrineMain: true,
        precoPromocional: true,
        precoOriginal: true,
        paymentTypeMain: true,
        monthlyMonthsMain: true,
      },
    }),
    // Pacotes PMB (tenantId=null) vendáveis na venda direta do PMB.
    resolveVitrinePackages(null),
    // Planos de assinatura da vitrine PMB. A MESMA função que a loja usa, para
    // a venda direta nunca oferecer um plano que a vitrine já não vende (sem
    // preço, sem curso no escopo, desativado).
    resolveVitrinePlans(null),
    getSystemSettings(),
    // Cap individual de desconto do vendedor (User.maxDiscount; padrão 50).
    effectiveSalesCap(session),
  ])

  return (
    <div className="p-8">
      <NovaVendaClient
        cap={cap}
        gateway={settings.pmbDirectSaleGateway}
        courses={courses.map((c) => {
          // Curso mensal: o preço é a MENSALIDADE; a venda cobra o total da
          // vitrine (mesma conta da rota) e o parcelado abre com meses x mensalidade.
          const price = Number(c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0)
          const paymentType = coursePaymentType(c.paymentTypeMain)
          const months = c.monthlyMonthsMain ?? 12
          return {
            id: c.id,
            nome: c.nome,
            preco: vitrineCoursePrice(c.paymentTypeMain, price, months),
            paymentType,
            monthly: paymentType === "MONTHLY" ? { months, value: price } : null,
          }
        })}
        packages={vitrinePackages.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          courseCount: p.courseCount,
        }))}
        plans={vitrinePlans.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          interval: p.interval,
          courseCount: p.courseCount,
        }))}
      />
    </div>
  )
}
