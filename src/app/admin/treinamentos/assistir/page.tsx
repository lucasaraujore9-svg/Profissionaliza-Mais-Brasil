import { requireAdminPage } from "@/lib/auth/admin-guard"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { TrainingsGrid, type TrainingModuleCard } from "@/components/painel/trainings-grid"

export const metadata = {
  title: "Treinamentos | Admin",
}

// Página de ASSISTIR treinamentos para a equipe interna PMB (qualquer papel
// admin). Espelha /painel/treinamentos, mas com basePath/endpoint próprios do
// admin. A gestão (criar/editar) continua em /admin/treinamentos (SUPER_ADMIN).
export default async function AdminAssistirTreinamentosPage() {
  const session = await requireAdminPage("treinamentos.view")
  const userId = session.userId

  const modules = await prisma.trainingModule.findMany({
    where: { published: true },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      videos: {
        where: { published: true },
        orderBy: { position: "asc" },
        select: { id: true, youtubeId: true },
      },
    },
  })

  const completed = await prisma.trainingProgress.findMany({
    where: { userId, video: { published: true, module: { published: true } } },
    select: { videoId: true },
  })
  const completedSet = new Set(completed.map((c) => c.videoId))

  const cards: TrainingModuleCard[] = modules
    .filter((m) => m.videos.length > 0)
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      coverUrl: m.coverUrl,
      firstVideoYoutubeId: m.videos[0]?.youtubeId ?? null,
      totalVideos: m.videos.length,
      completedVideos: m.videos.filter((v) => completedSet.has(v.id)).length,
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinamentos"
        description="Aprenda a tirar o máximo da plataforma. Assista no seu ritmo e acompanhe seu progresso."
      />
      <TrainingsGrid modules={cards} basePath="/admin/treinamentos/assistir" />
    </div>
  )
}
