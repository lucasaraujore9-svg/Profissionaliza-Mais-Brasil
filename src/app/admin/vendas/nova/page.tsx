import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { getSystemSettings } from "@/lib/system-settings"
import { NovaVendaClient } from "@/components/admin/nova-venda-client"
import { coursePaymentType } from "@/lib/tenant/monthly-policy"
import { resolveVitrinePackages } from "@/lib/packages/vitrine"

export const dynamic = "force-dynamic"

export default async function NovaVendaPage() {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas/nova")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const [courses, vitrinePackages, settings] = await Promise.all([
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
    getSystemSettings(),
  ])

  return (
    <div className="p-8">
      <NovaVendaClient
        role={session.role}
        gateway={settings.pmbDirectSaleGateway}
        courses={courses.map((c) => ({
          id: c.id,
          nome: c.nome,
          preco: Number(c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal ?? 0),
          paymentType: coursePaymentType(c.paymentTypeMain),
          monthlyMonths: c.monthlyMonthsMain ?? null,
        }))}
        packages={vitrinePackages.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          courseCount: p.courseCount,
        }))}
      />
    </div>
  )
}
