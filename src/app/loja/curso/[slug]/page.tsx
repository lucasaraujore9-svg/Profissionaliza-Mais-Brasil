import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getTenantCourseBySlug } from "@/lib/tenant/courses"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"

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
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: course.imageUrl ? [{ url: course.imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

function whatsappLink(whatsapp: string, courseName: string): string {
  const digits = whatsapp.replace(/\D/g, "")
  const text = encodeURIComponent(
    `Olá! Tenho interesse no curso "${courseName}".`,
  )
  return `https://wa.me/${digits}?text=${text}`
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

  // Sem MP configurado, o checkout não consegue gerar a preferência.
  // Cai no fluxo de lead (WhatsApp do revendedor) com mensagem pré-preenchida.
  const tenantPayment = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { mpAccessToken: true, whatsapp: true },
  })
  const canCheckout = Boolean(tenantPayment?.mpAccessToken)
  const whatsapp = tenantPayment?.whatsapp ?? null

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
    parcelas: course.parcelasSugeridas,
    lessons: course.lessons,
  }

  const ctaHref = canCheckout
    ? `/checkout?course_id=${course.tenantCourseId}`
    : whatsapp
      ? whatsappLink(whatsapp, course.nome)
      : "#"
  const ctaLabel = canCheckout ? "Comprar agora" : "Quero me matricular"

  return (
    <CourseDetailView
      course={data}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      backHref="/"
      backLabel="Voltar para a loja"
    />
  )
}

export const dynamic = "force-dynamic"
