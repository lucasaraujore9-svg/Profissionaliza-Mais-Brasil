import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { TrainingPlayer, type PlayerVideo } from "@/components/painel/training-player"

export const metadata = {
  title: "Treinamento | Admin",
}

export default async function AdminAssistirTreinamentoModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/treinamentos/assistir")
  const userId = session.userId
  const { moduleId } = await params

  const trainingModule = await prisma.trainingModule.findFirst({
    where: { id: moduleId, published: true },
    select: {
      id: true,
      title: true,
      description: true,
      videos: {
        where: { published: true },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          youtubeId: true,
          durationLabel: true,
        },
      },
    },
  })

  if (!trainingModule || trainingModule.videos.length === 0) notFound()

  const completed = await prisma.trainingProgress.findMany({
    where: { userId, videoId: { in: trainingModule.videos.map((v) => v.id) } },
    select: { videoId: true },
  })
  const completedSet = new Set(completed.map((c) => c.videoId))

  const videos: PlayerVideo[] = trainingModule.videos.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    youtubeId: v.youtubeId,
    durationLabel: v.durationLabel,
    completed: completedSet.has(v.id),
  }))

  return (
    <div className="space-y-4">
      <Link
        href="/admin/treinamentos/assistir"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[var(--color-pmb-green)]"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar aos treinamentos
      </Link>
      <TrainingPlayer
        moduleTitle={trainingModule.title}
        moduleDescription={trainingModule.description}
        videos={videos}
        progressPath="/api/admin/treinamentos/progress"
      />
    </div>
  )
}
