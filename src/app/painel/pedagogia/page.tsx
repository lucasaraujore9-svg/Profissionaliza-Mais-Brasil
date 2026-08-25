import { Prisma } from "@prisma/client"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { parsePolicy } from "@/lib/pedagogia/policy"
import { policyToInput } from "@/lib/pedagogia/schema"
import { PedagogyForm } from "@/components/painel/pedagogy-form"

export const metadata = { title: "Regras de estudo" }

/**
 * REGRAS DE ESTUDO da unidade: em que ordem as aulas abrem, quantas por dia e
 * em que dias e horarios o aluno pode estudar.
 *
 * A tela carrega o ALCANCE real porque a regra NAO vale igual em todo curso:
 * em parte do catalogo ela e aplicada aula a aula; no resto, so o horario
 * alcanca — e por login. Omitir isso faria a unidade configurar "3 aulas por
 * dia" para um catalogo onde isso nao acontece, e descobrir pelo aluno.
 *
 * A tela NUNCA nomeia nem caracteriza a fornecedora (ver a invariante em
 * `students/course-access.test.ts`): fala do EFEITO por curso, que e o que a
 * unidade precisa saber, e nao de quem entrega o conteudo.
 */
export default async function PainelPedagogiaPage() {
  const ctx = await requirePainelPage("pedagogia.view")

  const [tenant, cursos, overrides] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { pedagogyPolicy: true },
    }),
    prisma.tenantCourse.findMany({
      where: { tenantId: ctx.tenantId, isVisible: true },
      select: { courseId: true, course: { select: { provider: true } } },
    }),
    prisma.tenantCourse.findMany({
      where: { tenantId: ctx.tenantId, pedagogyPolicy: { not: Prisma.DbNull } },
      select: {
        courseId: true,
        pedagogyPolicy: true,
        course: { select: { nome: true, provider: true } },
      },
      orderBy: { course: { nome: "asc" } },
    }),
  ])

  const alcance = {
    proprios: cursos.filter((c) => c.course.provider === "LMS").length,
    parceira: cursos.filter((c) => c.course.provider !== "LMS").length,
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Regras de estudo</h1>
        <p className="text-sm text-muted-foreground">
          Defina como o aluno avança no curso: a ordem das aulas, o ritmo diário e os
          horários em que ele pode estudar.
        </p>
      </header>

      <PedagogyForm
        inicial={policyToInput(parsePolicy(tenant?.pedagogyPolicy))}
        alcance={alcance}
        overrides={overrides
          .map((o) => ({
            courseId: o.courseId,
            nome: o.course.nome,
            proprio: o.course.provider === "LMS",
          }))}
      />
    </div>
  )
}
