import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PageHeader } from "@/components/painel/page-header"
import { AuthoredGradingClient } from "@/components/painel/authored-grading-client"
import { requireCourseAuthoringPage } from "@/lib/course-authoring/module-gate"

export const metadata = { title: "Correção de provas" }
export const dynamic = "force-dynamic"

/**
 * Correção das questões dissertativas dos cursos que a unidade produziu. A prova
 * mora na plataforma de aulas; esta tela lê e grava por `lib/lms/grading.ts`.
 */
export default async function PainelCorrecoesPage() {
  const ctx = await requireCourseAuthoringPage("cursosAutorais.view")

  return (
    <div className="space-y-6">
      <Link
        href="/painel/cursos"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--color-pmb-green-900)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para o catálogo
      </Link>
      <PageHeader
        title="Correção de provas"
        description="Respostas dissertativas dos seus cursos aguardando nota. Ao salvar, o aluno é avisado e o progresso dele no curso é recalculado."
      />
      <AuthoredGradingClient canManage={ctx.can("cursosAutorais.manage")} />
    </div>
  )
}
