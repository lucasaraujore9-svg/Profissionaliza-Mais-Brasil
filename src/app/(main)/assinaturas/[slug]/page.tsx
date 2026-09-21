import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import {
  getVitrinePlanBySlug,
  getVitrinePlanDetail,
} from "@/lib/subscriptions/plans"
import { PlanDetailView } from "@/components/loja/plan-detail-view"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const plan = await getVitrinePlanBySlug(null, slug)
  if (!plan) return { title: "Plano não encontrado" }
  return {
    title: `${plan.name} — Profissionaliza Mais Brasil`,
    description:
      (plan.description ?? "").slice(0, 160) ||
      `Assinatura com acesso a ${plan.courseCount} cursos profissionalizantes.`,
    alternates: { canonical: `/assinaturas/${plan.slug}` },
  }
}

export default async function PlanoPage({ params }: Props) {
  // Mesmo motivo da listagem: o plano é da PMB e o checkout só aceita o host
  // PMB. Ver o comentário em ../page.tsx.
  if (await getCurrentTenant()) notFound()

  const { slug } = await params
  const plan = await getVitrinePlanDetail(null, slug)
  if (!plan) notFound()

  return (
    <PlanDetailView
      plan={plan}
      ctaHref={`/checkout?plan_id=${plan.id}`}
      ctaLabel="Assinar agora"
      backHref="/assinaturas"
      backLabel="Voltar para os planos"
      allCoursesHref="/cursos"
    />
  )
}
