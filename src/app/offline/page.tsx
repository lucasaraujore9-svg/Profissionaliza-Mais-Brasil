import Link from "next/link"
import Image from "next/image"
import { WifiOff, RefreshCcw } from "lucide-react"

export const dynamic = "force-static"

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-pmb-green-900)] px-6 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-4 shadow-xl">
        <Image
          src="/images/logo.png"
          alt="PMB"
          width={80}
          height={80}
          className="h-full w-full object-contain"
        />
      </div>

      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-[var(--color-pmb-lime)]">
        <WifiOff className="h-6 w-6" />
      </span>

      <h1 className="font-display text-2xl">Você está offline</h1>
      <p className="mt-2 max-w-sm text-sm text-white/80">
        Sem conexão no momento. Algumas páginas podem estar disponíveis em
        cache. Quando a internet voltar, volte para esta página e atualize.
      </p>

      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-lg bg-[var(--color-pmb-lime)] px-4 py-2 text-sm font-semibold text-[var(--color-pmb-green-900)] hover:bg-white"
        >
          Tentar a página inicial
        </Link>
        <a
          href="."
          className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Recarregar
        </a>
      </div>
    </div>
  )
}
