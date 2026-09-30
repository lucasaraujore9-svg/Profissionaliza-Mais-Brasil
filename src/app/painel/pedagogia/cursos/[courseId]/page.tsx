import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requirePainelPage } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import { parsePolicy } from "@/lib/pedagogia/policy"
import { policyToInput } from "@/lib/pedagogia/schema"
import { PedagogyForm, RemoverRegraCurso } from "@/components/painel/pedagogy-form"

export const metadata = { title: "Regras de estudo do curso" }
export const dynamic = "force-dynamic"

/**
 * REGRA PROPRIA de UM curso nesta vitrine. Salvar alcanca tambem quem JA
 * comprou o curso (`syncCoursePedagogyToLms`, via a rota do curso); "Voltar as
 * regras da unidade" remove o override.
 *
 * Sem regra propria, o formulario abre com o padrao da unidade — e o ponto de
 * partida natural, e salvar sem mexer cria uma regra propria identica.
 */
export default async function PainelPedagogiaCursoPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const ctx = await requirePainelPage("pedagogia.view")
  const { courseId } = await params

  const [tenant, tc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { pedagogyPolicy: true } }),
    prisma.tenantCourse.findUnique({
      where: { tenantId_courseId: { tenantId: ctx.tenantId, courseId } },
      select: { pedagogyPolicy: true, course: { select: { nome: true, provider: true } } },
    }),
  ])
  if (!tc) notFound()

  const proprio = tc.course.provider === "LMS"
  const temRegra = tc.pedagogyPolicy != null

  return (
    <div className="space-y-6">
      <Link
        href="/painel/pedagogia"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--color-pmb-green-900)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para regras de estudo
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{tc.course.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {temRegra
            ? "Este curso tem regra própria: ela vale no lugar das regras da unidade."
            : "Este curso segue as regras da unidade. Salvar abaixo cria uma regra só para ele."}{" "}
          A mudança vale também para quem já comprou.
        </p>
        {!proprio && (
          <p className="text-sm text-muted-foreground">
            Neste curso só o horário de estudo é aplicado.
          </p>
        )}
      </header>

      {/* `key`: ao remover a regra propria o `inicial` passa a ser o da unidade,
          e o estado interno do formulario tem que recomecar dele — senao salvar
          recriaria o override que acabou de ser removido. */}
      <PedagogyForm
        key={temRegra ? "curso" : "unidade"}
        inicial={policyToInput(parsePolicy(temRegra ? tc.pedagogyPolicy : tenant?.pedagogyPolicy))}
        alcance={{ proprios: proprio ? 1 : 0, parceira: proprio ? 0 : 1 }}
        endpoint={`/api/painel/cursos/${courseId}/pedagogia`}
        acoes={temRegra ? <RemoverRegraCurso courseId={courseId} /> : null}
      />
    </div>
  )
}
