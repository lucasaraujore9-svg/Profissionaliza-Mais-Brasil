import { notFound } from "next/navigation"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getTenantCourseBySlug } from "@/lib/tenant/courses"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"

interface CoursePageProps {
  params: Promise<{ slug: string }>
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

  // getTenantCourseBySlug já aplica a hierarquia tenant > admin > EA
  const course = await getTenantCourseBySlug(tenant.id, slug)
  if (!course) notFound()

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

  return (
    <CourseDetailView
      course={data}
      ctaHref={`/checkout/${course.tenantCourseId}`}
      ctaLabel="Comprar agora"
      backHref="/"
      backLabel="Voltar para a loja"
    />
  )
}

export const dynamic = "force-dynamic"
