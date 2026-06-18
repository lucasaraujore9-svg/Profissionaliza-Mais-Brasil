import Image from "next/image"
import Link from "next/link"
import { GraduationCap, PlayCircle, CheckCircle2 } from "lucide-react"
import { youtubeThumbUrl } from "@/lib/training/youtube"

export interface TrainingModuleCard {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  firstVideoYoutubeId: string | null
  totalVideos: number
  completedVideos: number
}

export function TrainingsGrid({ modules }: { modules: TrainingModuleCard[] }) {
  if (modules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-20 text-center">
        <GraduationCap className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 font-medium text-gray-700">Nenhum treinamento disponível ainda</p>
        <p className="mt-1 text-sm text-gray-500">
          Em breve novos conteúdos serão publicados aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((m) => {
        const pct =
          m.totalVideos === 0 ? 0 : Math.round((m.completedVideos / m.totalVideos) * 100)
        const done = pct === 100
        const cover =
          m.coverUrl ?? (m.firstVideoYoutubeId ? youtubeThumbUrl(m.firstVideoYoutubeId) : null)
        return (
          <Link
            key={m.id}
            href={`/painel/treinamentos/${m.id}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
              {cover ? (
                <Image
                  src={cover}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <GraduationCap className="h-10 w-10 text-gray-300" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                <PlayCircle className="h-12 w-12 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
              </div>
              {done && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-green)] px-2 py-0.5 text-xs font-semibold text-white shadow">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-semibold text-gray-900 line-clamp-2">{m.title}</h3>
              {m.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{m.description}</p>
              )}
              <div className="mt-auto pt-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {m.totalVideos} aula{m.totalVideos === 1 ? "" : "s"}
                  </span>
                  <span>
                    {m.completedVideos}/{m.totalVideos}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[var(--color-pmb-green)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
