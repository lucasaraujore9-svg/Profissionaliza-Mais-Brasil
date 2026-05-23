import { Users, GraduationCap, BookOpen, DollarSign } from "lucide-react"
import { prisma } from "@/lib/prisma"

interface PublicMetrics {
  resellers: number | null
  courses: number | null
  students: number | null
  revenue: number | null
}

const PLACEHOLDER: PublicMetrics = {
  resellers: null,
  courses: null,
  students: null,
  revenue: null,
}

async function loadMetrics(): Promise<PublicMetrics> {
  try {
    const [resellers, courses, students, revenueAgg] = await Promise.all([
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.course.count({ where: { status: "ATIVO", hiddenMain: false } }),
      prisma.student.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { mpStatus: "APPROVED" },
      }),
    ])
    return {
      resellers,
      courses,
      students,
      revenue: Number(revenueAgg._sum.amount ?? 0),
    }
  } catch (error) {
    console.error("[NumerosBento] sem dados:", error)
    return PLACEHOLDER
  }
}

function formatCount(value: number | null): string {
  if (value === null) return "—"
  if (value >= 1000) {
    const thousands = value / 1000
    return `${thousands.toFixed(thousands >= 10 ? 0 : 1).replace(".", ",")}K+`
  }
  return `${value}+`
}

function formatRevenue(value: number | null): string {
  if (value === null) return "—"
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`
  }
  return `R$ ${value.toFixed(0)}`
}

export async function NumerosBento() {
  const metrics = await loadMetrics()

  const items = [
    {
      icon: Users,
      label: "Revendedores",
      value: formatCount(metrics.resellers),
      hint: "Empreendedores ativos",
      color: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]",
      span: "md:col-span-2",
    },
    {
      icon: BookOpen,
      label: "Cursos disponíveis",
      value: metrics.courses === null ? "—" : String(metrics.courses),
      hint: "Catálogo atualizado",
      color: "bg-purple-50 text-purple-600",
      span: "",
    },
    {
      icon: GraduationCap,
      label: "Alunos ativos",
      value: formatCount(metrics.students),
      hint: "Estudando agora",
      color: "bg-green-50 text-green-600",
      span: "",
    },
    {
      icon: DollarSign,
      label: "Receita gerada",
      value: formatRevenue(metrics.revenue),
      hint: "Pelos revendedores",
      color: "bg-orange-50 text-orange-600",
      span: "md:col-span-2",
    },
  ]

  return (
    <section className="bg-[#FAFAFA] py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Números que inspiram
          </h2>
          <p className="mt-4 text-gray-600">
            A plataforma cresce junto com quem empreende.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {items.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-2xl border border-gray-200 bg-white p-6 lg:p-8 ${metric.span}`}
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${metric.color}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <div className="mt-6 font-mono text-4xl font-bold tracking-tight text-[var(--color-pmb-green-900)] lg:text-5xl">
                {metric.value}
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--color-pmb-green-900)]">{metric.label}</p>
              <p className="text-xs text-gray-500">{metric.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
