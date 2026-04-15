import { notFound } from "next/navigation"
import { Breadcrumb } from "@/components/loja/breadcrumb"
import { CourseHero } from "@/components/loja/course-hero"
import { PriceDisplay } from "@/components/loja/price-display"
import { CourseDescription } from "@/components/loja/course-description"
import {
  LessonAccordion,
  type LessonAccordionModulo,
} from "@/components/loja/lesson-accordion"
import { CourseStats } from "@/components/loja/course-stats"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getTenantCourseBySlug } from "@/lib/tenant/courses"

interface CoursePageProps {
  params: Promise<{ slug: string }>
}

const GRADIENT_BY_CATEGORY: Record<string, string> = {
  tecnologia: "from-green-600 to-emerald-800",
  saude: "from-rose-600 to-pink-800",
  beleza: "from-purple-600 to-fuchsia-800",
  administracao: "from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)]",
  gastronomia: "from-orange-600 to-red-700",
  default: "from-slate-700 to-slate-900",
}

function pickGradient(cat: string | null): string {
  if (!cat) return GRADIENT_BY_CATEGORY.default
  const key = cat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  return GRADIENT_BY_CATEGORY[key] ?? GRADIENT_BY_CATEGORY.default
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

  const course = await getTenantCourseBySlug(tenant.id, slug)

  if (!course) notFound()

  const categoria = course.categoria ?? "Geral"
  const gradient = pickGradient(course.categoria)

  const modulos: LessonAccordionModulo[] =
    course.lessons.length > 0
      ? [
          {
            numero: 1,
            titulo: "Conteúdo completo",
            duracao: course.horas ?? undefined,
            aulas: course.lessons.map((l, i) => ({
              titulo: l.nome,
              preview: i === 0,
            })),
          },
        ]
      : []

  return (
    <>
      <section className="bg-white py-6 md:py-8">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Breadcrumb
            items={[
              { label: "Cursos", href: "/loja" },
              {
                label: categoria,
                href: `/loja?category=${encodeURIComponent(categoria.toLowerCase())}`,
              },
              { label: course.nome },
            ]}
          />
        </div>
      </section>

      <section className="bg-white pb-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <CourseHero
            categoria={categoria}
            nome={course.nome}
            tagline={
              course.descricao?.split("\n")[0] ??
              "Curso profissionalizante online com certificado."
            }
            rating={4.8}
            ratingCount={0}
            alunos="—"
            horas={course.horas ?? "—"}
            gradient={gradient}
          />
        </div>
      </section>

      <section className="bg-[#FAFAFA] py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
            <div className="space-y-12">
              <CourseStats
                horas={course.horas}
                modulos={modulos.length}
                alunos="—"
                temCertificado
              />
              <CourseDescription descricao={course.descricao} />
              <LessonAccordion
                modulos={modulos}
                totalHoras={course.horas ?? undefined}
              />
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <PriceDisplay
                courseId={course.tenantCourseId}
                basePrice={course.price}
                originalPrice={course.originalPrice}
                parcelasSugeridas={course.parcelasSugeridas}
              />
            </aside>
          </div>
        </div>
      </section>

      <div className="pb-20 lg:pb-0" />
    </>
  )
}
