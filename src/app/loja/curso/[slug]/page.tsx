import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getTenantCourseBySlug } from "@/lib/tenant/courses"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"
import { LeadInquiryCard } from "@/components/loja/lead-inquiry-card"
import { getRequestOrigin } from "@/lib/seo/host"
import { JsonLd } from "@/components/seo/json-ld"
import { courseJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

interface CoursePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: CoursePageProps): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const { slug } = await params
  if (!tenant) return { title: "Curso" }
  const course = await getTenantCourseBySlug(tenant.id, slug)
  if (!course) return { title: "Curso não encontrado" }
  const title = `${course.nome} — ${tenant.name}`
  const description =
    (course.descricao ?? "").slice(0, 160) ||
    `Matricule-se em ${course.nome} pela vitrine ${tenant.name}.`
  const origin = await getRequestOrigin()
  const courseUrl = origin ? `${origin}/curso/${course.slug}` : undefined
  return {
    title,
    description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    alternates: { canonical: `/curso/${course.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(courseUrl ? { url: courseUrl } : {}),
      images: course.imageUrl ? [{ url: course.imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function CoursePage({ params }: CoursePageProps) {
  const tenant = await getCurrentTenant()
  const { slug } = await params

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Curso indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja.
        </p>
      </div>
    )
  }

  // getTenantCourseBySlug já aplica a hierarquia tenant > admin > plataforma
  const course = await getTenantCourseBySlug(tenant.id, slug)
  if (!course) notFound()

  // Gateway efetivo da unidade (MP | ASAAS | NONE) via helper central — antes
  // checava só mpAccessToken, o que quebrava revendas que usam SÓ Asaas.
  const tenantPayment = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      mpAccessToken: true,
      mpPublicKey: true,
      salesGateway: true,
      asaasGatewayEnabled: true,
      asaasConnected: true,
      interestFreeInstallments: true,
    },
  })
  const checkoutMode = tenantCheckoutMode({
    salesGateway: tenantPayment?.salesGateway,
    asaasGatewayEnabled: tenantPayment?.asaasGatewayEnabled,
    asaasConnected: tenantPayment?.asaasConnected,
    mpAccessToken: tenantPayment?.mpAccessToken,
    mpPublicKey: tenantPayment?.mpPublicKey,
  })

  const data: CourseDetailData = {
    slug: course.slug,
    nome: course.nome,
    categoria: course.categoria ?? "Curso profissionalizante",
    descricao: course.descricao,
    qtdAulas: course.qtdAulas,
    cargaHoraria: course.horas,
    imageUrl: course.imageUrl,
    price: course.price,
    originalPrice: course.originalPrice,
    // Pagamento único: "Nx sem juros" vem do nº GLOBAL da unidade
    // (Configurações → Pagamento), não de um valor por curso.
    parcelas: displayInterestFreeInstallments(
      tenantPayment?.interestFreeInstallments ?? 1,
    ),
    paymentType: course.paymentType,
    monthlyMonths: course.monthlyMonths,
    lessons: course.lessons,
    matriz: course.matriz,
    aprendizado: course.aprendizado,
  }

  // CTA sempre aponta para o checkout DA VITRINE. Quando a unidade não tem
  // gateway próprio (NONE), a página de checkout exibe o formulário de contato
  // (e-mail p/ a revenda + lead) — nunca o checkout do sistema mãe.
  const ctaHref = `/checkout?course_id=${course.tenantCourseId}`
  const ctaLabel = checkoutMode === "NONE" ? "Quero me matricular" : "Comprar agora"

  const inquirySlot = tenant.automationEnabled ? (
    <LeadInquiryCard
      courseSlug={course.slug}
      courseName={course.nome}
      escolaName={tenant.name}
    />
  ) : null

  const origin = await getRequestOrigin()
  const jsonLd =
    origin != null
      ? [
          courseJsonLd({
            name: course.nome,
            url: `${origin}/curso/${course.slug}`,
            description: course.descricao,
            image: course.imageUrl,
            providerName: tenant.name,
            providerUrl: origin,
            price: course.price,
            hours: course.horas,
          }),
          breadcrumbJsonLd([
            { name: tenant.name, url: origin },
            { name: course.nome, url: `${origin}/curso/${course.slug}` },
          ]),
        ]
      : null

  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <CourseDetailView
        course={data}
        ctaHref={ctaHref}
        ctaLabel={ctaLabel}
        backHref="/"
        backLabel="Voltar para a loja"
        inquirySlot={inquirySlot}
      />
    </>
  )
}

export const dynamic = "force-dynamic"
