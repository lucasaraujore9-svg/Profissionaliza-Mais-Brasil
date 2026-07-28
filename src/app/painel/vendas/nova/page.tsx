import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { PainelNovaVendaClient } from "@/components/painel/painel-nova-venda-client"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { coursePaymentType, monthlyActive } from "@/lib/tenant/monthly-policy"
import { MAX_BOLETO_INSTALLMENTS } from "@/lib/installments/schedule"
import { resolveVitrinePackages } from "@/lib/packages/vitrine"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const dynamic = "force-dynamic"

export default async function PainelNovaVendaPage() {
  await requirePainelPage("vendas.create")
  const session = await auth()
  const user = session?.user as
    | { id?: string; tenantId?: string | null; role?: string }
    | undefined
  if (!user?.id) redirect("/login?callbackUrl=/painel/vendas/nova")
  if (!user.tenantId) redirect("/painel")

  await ensureTenantCourses(user.tenantId)

  const [tenant, tenantCourses, vitrinePackages, member] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        salesGateway: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
      },
    }),
    prisma.tenantCourse.findMany({
      where: { tenantId: user.tenantId, isVisible: true },
      orderBy: [{ isFeatured: "desc" }, { customOrder: "asc" }],
      include: {
        course: { select: { nome: true, status: true } },
      },
    }),
    // Pacotes vendáveis nesta vitrine (PMB distribuídos + próprios da unidade).
    resolveVitrinePackages(user.tenantId),
    // Cap de desconto do vendedor logado: o dono da unidade (sem TenantMember)
    // não tem teto (100%); consultor ativo usa o próprio maxDiscount; consultor
    // inativo fica sem desconto (0). Mesma regra aplicada no POST da rota.
    prisma.tenantMember.findFirst({
      where: { tenantId: user.tenantId, userId: user.id },
      select: { maxDiscount: true, status: true },
    }),
  ])

  const cap = !member
    ? 100
    : member.status === "ATIVO"
      ? Math.min(Math.max(Math.trunc(member.maxDiscount ?? 0), 0), 100)
      : 0

  const courses = tenantCourses
    .filter((tc) => tc.course.status === "ATIVO")
    .map((tc) => ({
      id: tc.id,
      nome: tc.course.nome,
      price: Number(tc.price),
      paymentType: coursePaymentType(tc.paymentType),
    }))

  const packages = vitrinePackages.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    courseCount: p.courseCount,
  }))

  // Carnê (parcelado no boleto) usa a MESMA capability de mensalidade: quando o
  // pagamento parcelado está ativo (admin liberou + unidade ativou), o carnê
  // fica disponível na venda direta. Sem campo/toggle próprio.
  const installmentConfig =
    tenant && monthlyActive(tenant)
      ? { maxCount: MAX_BOLETO_INSTALLMENTS, gateway: tenant.salesGateway }
      : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova venda direta"
        description="Cadastre o aluno, escolha o curso e gere o link de pagamento."
      />
      <PainelNovaVendaClient
        cap={cap}
        gateway={tenant?.salesGateway ?? "MP"}
        courses={courses}
        packages={packages}
        installmentConfig={installmentConfig}
      />
    </div>
  )
}
