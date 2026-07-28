import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"
import { TrainingsGrid, type TrainingModuleCard } from "@/components/painel/trainings-grid"
import { requirePainelPage } from "@/lib/auth/painel-guard"

export const metadata = {
  title: "Treinamentos | Painel",
}

export default async function PainelTreinamentosPage() {
  await requirePainelPage("treinamentos.view")
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    redirect("/login?callbackUrl=/painel/treinamentos")
  }
  const userId = session.user.id as string

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

  // Progresso do usuario nas aulas publicadas.
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
      <TrainingsGrid modules={cards} />
    </div>
  )
}
