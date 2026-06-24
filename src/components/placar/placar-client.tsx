"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PlacarSnapshot } from "@/lib/placar/snapshot"

// ============================================================
// Som de celebracao de venda nova: fanfarra de trompetes (arquivo MP3).
// Precisa de um gesto do usuario para destravar o autoplay (regra dos
// navegadores) — por isso o botao "Ativar som".
// ============================================================
const SOUND_URL = "/sounds/venda-paga.mp3"

// Count-up suave do numero grande quando o valor muda.
function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration])

  return display
}

interface FunnelStage {
  key: keyof PlacarSnapshot["funnel"]
  label: string
  color: string
  bar: string
}

const STAGES: FunnelStage[] = [
  {
    key: "aguardando",
    label: "Aguardando pagamento",
    color: "text-amber-300",
    bar: "from-amber-500 to-amber-400",
  },
  {
    key: "ativos",
    label: "Ativas / pagas",
    color: "text-emerald-300",
    bar: "from-emerald-500 to-emerald-400",
  },
]

interface Celebration {
  id: number
  name: string
}

export function PlacarClient({
  initial,
  testMode = false,
  streamUrl = "/api/placar/stream",
  title = "Placar de Lançamento",
  subtitle,
  mainLabel = "Revendas ativas",
  celebrationTitle = "NOVA REVENDA ATIVADA!",
  logoUrl = "/images/logo.png",
  showMeta = true,
}: {
  initial: PlacarSnapshot
  testMode?: boolean
  /** Endpoint SSE. Default: placar público de lançamento. */
  streamUrl?: string
  title?: string
  /** Linha sob o título. Default: "Meta: {meta} revendas ativas". */
  subtitle?: string
  /** Rótulo do número principal. */
  mainLabel?: string
  /** Texto do pop-up de celebração de nova ativação. */
  celebrationTitle?: string
  /** Logo do cabeçalho; null oculta (ex.: dentro do painel, com sidebar própria). */
  logoUrl?: string | null
  /**
   * Mostra a meta: denominador "/ {meta}", barra de progresso e "faltam X".
   * Default true (placar de lançamento). false = só o número de ativas.
   */
  showMeta?: boolean
}) {
  const [snap, setSnap] = useState<PlacarSnapshot>(initial)
  const [live, setLive] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const celebTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const ativosDisplay = useCountUp(snap.ativos)

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null
    if (!audioRef.current) {
      const a = new Audio(SOUND_URL)
      a.preload = "auto"
      a.volume = 0.9
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  const playSound = useCallback(() => {
    const a = ensureAudio()
    if (!a) return
    try {
      a.currentTime = 0
    } catch {
      /* alguns browsers reclamam antes do load */
    }
    void a.play().catch(() => {
      /* autoplay bloqueado — sera destravado no proximo gesto do usuario */
    })
  }, [ensureAudio])

  const enableSound = useCallback(() => {
    playSound() // toca uma vez para confirmar que esta funcionando
    setSoundOn(true)
  }, [playSound])

  const celebrate = useCallback(
    (name: string) => {
      if (soundOn) playSound()
      idRef.current += 1
      setCelebration({ id: idRef.current, name })
      if (celebTimer.current) clearTimeout(celebTimer.current)
      celebTimer.current = setTimeout(() => setCelebration(null), 6500)
    },
    [soundOn, playSound]
  )

  // Conexao SSE com reconexao automatica do EventSource.
  useEffect(() => {
    const es = new EventSource(streamUrl)
    es.addEventListener("open", () => setLive(true))
    es.addEventListener("snapshot", (e) => {
      try {
        setSnap(JSON.parse((e as MessageEvent).data))
        setLive(true)
      } catch {
        /* ignora payload malformado */
      }
    })
    es.addEventListener("sale", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { name: string }
        celebrate(data.name || "Nova revenda")
      } catch {
        celebrate("Nova revenda")
      }
    })
    es.addEventListener("error", () => setLive(false))
    return () => es.close()
  }, [celebrate, streamUrl])

  const f = snap.funnel
  const maxFunnel = Math.max(...STAGES.map((s) => f[s.key]), 1)
  const restantes = Math.max(0, snap.meta - snap.ativos)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_#0b2e22_0%,_#09090b_55%)] px-4 py-6 text-white sm:px-8 sm:py-10">
      <style>{coinRainCss}</style>

      {/* Cabecalho */}
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Profissionaliza Mais Brasil"
              className="h-10 w-auto sm:h-12"
            />
          )}
          <div>
            <h1 className="font-heading text-lg leading-tight font-bold sm:text-2xl">
              {title}
            </h1>
            <p className="text-xs text-emerald-300/80 sm:text-sm">
              {subtitle ?? `Meta: ${snap.meta} revendas ativas`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10">
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "animate-pulse bg-emerald-400" : "bg-zinc-500"
              }`}
            />
            {live ? "Ao vivo" : "Conectando…"}
          </span>
          {!soundOn && (
            <button
              onClick={enableSound}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400"
            >
              🔊 Ativar som
            </button>
          )}
          {testMode && (
            <button
              onClick={() => {
                if (!soundOn) enableSound()
                celebrate("Revenda Teste")
              }}
              className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
            >
              🔔 Venda teste
            </button>
          )}
        </div>
      </header>

      {/* Numero principal + progresso da meta */}
      <section className="mx-auto mt-8 max-w-6xl sm:mt-12">
        <div className="text-center">
          <p className="text-sm font-medium tracking-widest text-emerald-300/80 uppercase sm:text-base">
            {mainLabel}
          </p>
          <div className="mt-1 flex items-end justify-center gap-3 sm:gap-5">
            <span className="font-heading text-[5.5rem] leading-none font-black tabular-nums text-emerald-300 drop-shadow-[0_0_35px_rgba(16,185,129,0.45)] sm:text-[10rem]">
              {ativosDisplay}
            </span>
            {showMeta && (
              <span className="mb-3 font-heading text-3xl font-bold text-white/40 sm:mb-7 sm:text-5xl">
                / {snap.meta}
              </span>
            )}
          </div>
          {showMeta && (
            <p className="mt-2 text-sm text-white/60 sm:text-base">
              {restantes > 0 ? (
                <>
                  Faltam{" "}
                  <strong className="text-white">{restantes}</strong> para a meta
                </>
              ) : (
                <strong className="text-emerald-300">🎉 Meta batida!</strong>
              )}
            </p>
          )}
        </div>

        {/* Barra de progresso — só quando há meta */}
        {showMeta && (
          <div className="mx-auto mt-6 max-w-3xl">
            <div className="h-5 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
              <div
                className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 pr-2 text-[10px] font-bold text-emerald-950 transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(snap.progresso, 4)}%` }}
              >
                {snap.progresso}%
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Funil */}
      <section className="mx-auto mt-10 max-w-4xl sm:mt-14">
        <h2 className="mb-4 text-center text-sm font-semibold tracking-wide text-white/70 uppercase">
          Funil de revendas
        </h2>
        <div className="space-y-3">
          {STAGES.map((stage) => {
            const value = f[stage.key]
            const width = Math.max(6, Math.round((value / maxFunnel) * 100))
            return (
              <div key={stage.key} className="flex items-center gap-4">
                <div className="w-44 shrink-0 text-right text-sm font-medium text-white/70 sm:text-base">
                  {stage.label}
                </div>
                <div className="flex-1">
                  <div
                    className={`flex h-12 items-center justify-end rounded-lg bg-gradient-to-r ${stage.bar} px-4 shadow-lg transition-[width] duration-700 ease-out`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="font-heading text-xl font-black tabular-nums text-black/80 sm:text-2xl">
                      {value}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Stats + ticker */}
      <section className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-14 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/5 p-6 text-center ring-1 ring-white/10">
          <p className="text-xs font-medium tracking-widest text-white/50 uppercase">
            Vendas hoje
          </p>
          <p className="font-heading mt-1 text-5xl font-black tabular-nums text-amber-300">
            {snap.novasHoje}
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <p className="mb-3 text-xs font-medium tracking-widest text-white/50 uppercase">
            Últimas ativadas
          </p>
          {snap.recentes.length === 0 ? (
            <p className="text-sm text-white/40">Nenhuma ainda. Bora! 🚀</p>
          ) : (
            <ul className="space-y-1.5">
              {snap.recentes.slice(0, 6).map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  className="flex items-center gap-2 text-sm text-white/80"
                >
                  <span className="text-emerald-400">✓</span>
                  <span className="truncate">{r.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-white/30">
        Atualizado em tempo real · Profissionaliza Mais Brasil
      </footer>

      {/* Celebracao de venda nova */}
      {celebration && (
        <div
          key={celebration.id}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="absolute inset-0 animate-[placarFlash_0.7s_ease-out] bg-emerald-400/20" />
          {/* Chuva de moedas */}
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="absolute top-[-10%] text-3xl"
              style={{
                left: `${(i * 2.7 + ((i * 37) % 11)) % 100}%`,
                animation: `placarFall ${1.6 + ((i * 13) % 18) / 10}s linear ${
                  ((i * 7) % 15) / 10
                }s forwards`,
              }}
            >
              🪙
            </span>
          ))}
          <div className="animate-[placarPop_0.5s_cubic-bezier(0.18,1.4,0.4,1)] rounded-3xl bg-emerald-500 px-10 py-8 text-center shadow-[0_0_80px_rgba(16,185,129,0.7)]">
            <p className="text-6xl">💰</p>
            <p className="font-heading mt-2 text-2xl font-black text-emerald-950 sm:text-4xl">
              {celebrationTitle}
            </p>
            <p className="mt-1 text-lg font-semibold text-emerald-900 sm:text-2xl">
              {celebration.name}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

const coinRainCss = `
@keyframes placarFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(115vh) rotate(540deg); opacity: 0.9; }
}
@keyframes placarPop {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes placarFlash {
  0% { opacity: 0.9; }
  100% { opacity: 0; }
}
`
