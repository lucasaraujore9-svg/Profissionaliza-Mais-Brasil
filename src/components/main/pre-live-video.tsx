"use client"

import { useEffect, useRef, useState } from "react"
import { RotateCcw, Volume2, VolumeX } from "lucide-react"

// Player de VSL da pagina pre-live (pos-cadastro de revendedor).
//
// Comportamento:
//  - ABERTURA IMEDIATA: o <video> e renderizado ja no HTML inicial (sem portal,
//    sem gate de estado), com `autoplay muted preload="auto"`. Assim o navegador
//    comeca a baixar e a tocar (mudo) assim que a pagina abre, antes mesmo de
//    terminar de carregar. Logo depois tentamos LIGAR o som; se o navegador
//    bloquear (autoplay com audio exige gesto), seguimos mudos e o botao dourado
//    vira "Ativar som".
//  - UNICO controle e o botao de mudo/desmudo — sem controles nativos.
//  - MINI-PLAYER fixo na tela: quando o quadro sai da viewport, o frame vira
//    `position: fixed` no canto inferior direito. Funciona sem portal porque
//    nenhum ancestral tem `transform`/`filter` (o que ancoraria o fixed na
//    secao em vez da viewport).
//  - Ao TERMINAR, "Assistir novamente" — usavel tambem no mini-player.
export function PreLiveVideo({ src }: { src: string }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [docked, setDocked] = useState(false)
  const [ended, setEnded] = useState(false)

  // Play imediato (mudo). So tentamos LIGAR o som em telas de ponteiro fino
  // (desktop): no celular, tentar desmutar dispara o bloqueio de autoplay e o
  // video nao chega a tocar. No touch fica mudo (e toca) e o botao "Ativar som"
  // liga o audio no primeiro toque.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    void v.play().catch(() => {})
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
    if (coarse) return
    const tryUnmute = async () => {
      try {
        v.muted = false
        v.volume = 1
        await v.play()
        setMuted(false)
      } catch {
        v.muted = true
        setMuted(true)
        void v.play().catch(() => {})
      }
    }
    void tryUnmute()
  }, [])

  // Dock/undock por posicao de scroll, com histerese (evita o jitter do
  // IntersectionObserver num video alto). No MOBILE vira mini-player ja na
  // primeira rolagem; no desktop, quando o video sai da viewport. O placeholder
  // segura o espaco do quadro, entao nao ha pulo de layout.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    let raf = 0
    const evaluate = () => {
      raf = 0
      const mobile = window.innerWidth < 1024
      if (mobile) {
        const y = window.scrollY
        setDocked((prev) => (prev ? y > 8 : y > 24))
      } else {
        const r = holder.getBoundingClientRect()
        const vh = window.innerHeight
        setDocked((prev) =>
          prev ? r.bottom < vh * 0.8 : r.bottom < vh * 0.4,
        )
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(evaluate)
    }
    evaluate()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted) v.volume = 1
    setMuted(v.muted)
    if (v.paused && !v.ended) void v.play().catch(() => {})
  }

  function replay() {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    setEnded(false)
    void v.play().catch(() => {})
  }

  return (
    <div ref={holderRef} className="relative aspect-[9/16] w-full">
      {/* Decoracoes do quadro inline (ocultas quando flutuando) */}
      {!docked && (
        <>
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-[2.5rem] opacity-70 blur-3xl"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 20%, rgba(242,183,5,0.55), transparent 60%), radial-gradient(circle at 70% 90%, rgba(192,217,4,0.45), transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="absolute -inset-[3px] -z-10 rounded-[1.75rem] opacity-80 blur-[2px]"
            style={{
              backgroundImage:
                "conic-gradient(from var(--pl-angle), var(--color-pmb-gold), var(--color-pmb-lime), transparent 45%, var(--color-pmb-gold))",
              animation: "pl-spin 9s linear infinite",
            }}
          />
          <div
            aria-hidden
            className="absolute -left-12 top-10 z-10 hidden items-center gap-2 rounded-xl border border-white/10 bg-[#06210f]/80 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md xl:flex"
          >
            <span className="text-base">🎓</span> +200 cursos
          </div>
          <div
            aria-hidden
            className="absolute -right-10 bottom-16 z-10 hidden items-center gap-2 rounded-xl border border-white/10 bg-[#06210f]/80 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md xl:flex"
          >
            <span className="text-base">💚</span> sem comissão
          </div>
        </>
      )}

      {/* Placeholder no espaco inline enquanto o video esta no mini-player */}
      {docked && (
        <div className="absolute inset-0 grid place-items-center rounded-[1.7rem] border border-dashed border-white/15 bg-white/[0.02] px-4 text-center text-xs text-white/45">
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-[var(--color-pmb-lime)]" />
            Reproduzindo no canto da tela
          </span>
        </div>
      )}

      {/* Quadro do video (inline ou flutuante no canto) */}
      <div
        className={
          docked
            ? "fixed bottom-4 right-4 z-50 aspect-[9/16] w-[140px] overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/20 transition-shadow sm:w-[180px]"
            : "absolute inset-0 overflow-hidden rounded-[1.7rem] bg-black ring-1 ring-white/10"
        }
      >
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted={muted}
          playsInline
          preload="auto"
          onEnded={() => setEnded(true)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          className="h-full w-full object-cover"
        />

        {/* Botao de mudo/desmudo — UNICO controle */}
        {!ended && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Ativar som do vídeo" : "Silenciar vídeo"}
            className={`absolute bottom-2 left-2 z-20 flex h-9 w-9 items-center justify-center rounded-full ring-1 backdrop-blur-sm transition ${
              muted
                ? "animate-pulse bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green-900)] ring-white/30"
                : "bg-black/55 text-white ring-white/20 hover:bg-black/75"
            }`}
          >
            {muted ? (
              <VolumeX className="h-4.5 w-4.5" />
            ) : (
              <Volume2 className="h-4.5 w-4.5" />
            )}
          </button>
        )}

        {/* "Ativar som" textual quando mudo e inline */}
        {!ended && muted && !docked && (
          <span className="pointer-events-none absolute bottom-3 left-14 z-20 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm">
            Ativar som
          </span>
        )}

        {/* Assistir novamente (funciona inline e no mini) */}
        {ended && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/65 backdrop-blur-[1px]">
            <button
              type="button"
              onClick={replay}
              aria-label="Assistir novamente"
              className={`inline-flex items-center gap-2 rounded-full bg-[var(--color-pmb-gold)] font-bold text-[var(--color-pmb-green-900)] shadow-lg ring-1 ring-white/30 transition-transform hover:scale-105 ${
                docked ? "px-3 py-2 text-[11px]" : "px-5 py-3 text-sm"
              }`}
            >
              <RotateCcw className={docked ? "h-3.5 w-3.5" : "h-4.5 w-4.5"} />
              {docked ? "Rever" : "Assistir novamente"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
