import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { prisma } from "@/lib/prisma"
import {
  getVitrinePlanBySlug,
  getVitrinePlanDetail,
} from "@/lib/subscriptions/plans"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { PlanDetailView } from "@/components/loja/plan-detail-view"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const { slug } = await params
  if (!tenant) return { title: "Assinatura" }
  const plan = await getVitrinePlanBySlug(tenant.id, slug)
  if (!plan) return { title: "Plano não encontrado" }
  return {
    title: `${plan.name} — ${tenant.name}`,
    description:
      (plan.description ?? "").slice(0, 160) ||
      `Assinatura com acesso a ${plan.courseCount} cursos.`,
    alternates: { canonical: `/assinatura/${plan.slug}` },
  }
}

export default async function LojaPlanoPage({ params }: Props) {
  const tenant = await getCurrentTenant()
  if (!tenant) notFound()

  const { slug } = await params
  const plan = await getVitrinePlanDetail(tenant.id, slug)
  if (!plan) notFound()

  // A loja cobra online? Só isso decide o destino do botão: quem paga (e como)
  // é problema do checkout. Manter a checagem aqui é o que evita a pessoa ler a
  // página inteira, clicar em "Assinar" e descobrir que a loja não cobra.
  const row = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      salesGateway: true,
      asaasApiKey: true,
      asaasWebhookToken: true,
      mpAccessToken: true,
      mpPublicKey: true,
    },
  })
  const gateway = tenantCheckoutMode({
    salesGateway: row?.salesGateway,
    asaasConnected: Boolean(row?.asaasApiKey && row?.asaasWebhookToken),
    mpAccessToken: row?.mpAccessToken,
    mpPublicKey: row?.mpPublicKey,
  })

  const semCobranca = gateway === "NONE"

  return (
    <PlanDetailView
      plan={plan}
      ctaHref={semCobranca ? "/contato" : `/checkout?plan_id=${plan.id}`}
      ctaLabel={semCobranca ? "Falar com a equipe" : "Assinar agora"}
      ctaNote={
        semCobranca
          ? "Esta loja ainda não recebe pagamentos online — a equipe conclui sua assinatura."
          : undefined
      }
      backHref="/assinaturas"
      backLabel="Voltar para os planos"
      allCoursesHref="/cursos"
    />
  )
}
