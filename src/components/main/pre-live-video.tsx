"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { RotateCcw, Volume2, VolumeX } from "lucide-react"

// Player de VSL da pagina pre-live (pos-cadastro de revendedor).
//
// Comportamento pedido:
//  - AUTOPLAY tentando COM som. Navegadores bloqueiam autoplay com audio sem
//    interacao previa; nesse caso caimos para mudo e o MESMO botao vira
//    "ativar som". Com o som ligado, o botao muta.
//  - UNICO controle e o botao de mudo/desmudo — sem controles nativos.
//  - MINI-PLAYER sempre visivel: quando o quadro original sai da viewport, o
//    video vira um mini-player FIXO no canto inferior direito da TELA e fica la
//    enquanto a pagina esta rolada. Volta ao quadro inline quando ele reaparece.
//  - Ao TERMINAR, "Assistir novamente" — usavel tambem no mini-player.
//
// IMPLEMENTACAO: o quadro do video e renderizado via PORTAL no <body>. Isso e
// essencial porque a pagina usa animacoes GSAP (data-reveal) que aplicam
// `transform` em ancestrais — e um ancestral com transform faz `position: fixed`
// se ancorar nele (na secao), nao na viewport. No body, o `fixed` cola na tela
// de verdade. Quando inline, o quadro fica `fixed` sobre o retangulo do holder
// (seguindo o scroll) — assim o mesmo <video> nunca remonta e a reproducao nao
// reinicia. O holder reserva o espaco (9:16) e exibe o glow/anel/placeholder.
export function PreLiveVideo({ src }: { src: string }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)
  const [docked, setDocked] = useState(false)
  const [ended, setEnded] = useState(false)
  // `rect` so e setado no client (no effect de medicao), entao serve de gate do
  // portal: null no SSR (nao renderiza portal), preenchido apos o mount.
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Autoplay: tenta com som; se o navegador bloquear, cai para mudo.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const start = async () => {
      try {
        v.muted = false
        v.volume = 1
        await v.play()
        setMuted(false)
      } catch {
        v.muted = true
        setMuted(true)
        try {
          await v.play()
        } catch {
          /* sem autoplay: usuario inicia pelo botao de som */
        }
      }
    }
    void start()
    const onLoad = () => {
      if (v.paused && !v.ended) void v.play().catch(() => {})
    }
    window.addEventListener("load", onLoad)
    return () => window.removeEventListener("load", onLoad)
  }, [])

  // Segue o retangulo do holder (para posicionar o quadro inline) e detecta
  // quando ele sai da viewport (para flutuar no canto).
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return

    let raf = 0
    const measure = () => setRect(holder.getBoundingClientRect())
    const onScrollResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", onScrollResize, { passive: true })
    window.addEventListener("resize", onScrollResize)
    const ro = new ResizeObserver(measure)
    ro.observe(holder)

    let obs: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== "undefined") {
      obs = new IntersectionObserver(
        ([entry]) => setDocked(!entry.isIntersecting),
        { threshold: 0.4 },
      )
      obs.observe(holder)
    }

    return () => {
      window.removeEventListener("scroll", onScrollResize)
      window.removeEventListener("resize", onScrollResize)
      ro.disconnect()
      obs?.disconnect()
      cancelAnimationFrame(raf)
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

  // Posicionamento do quadro flutuante (sempre `fixed`, ancorado no body).
  const frameStyle: CSSProperties = docked
    ? {
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        width: "clamp(120px, 38vw, 180px)",
        aspectRatio: "9 / 16",
        zIndex: 50,
      }
    : rect
      ? {
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 20,
        }
      : { position: "fixed", opacity: 0, pointerEvents: "none" }

  const frame = (
    <div style={frameStyle}>
      {/* Decoracoes (glow + anel + chips) apenas no estado inline */}
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

      {/* Quadro do video propriamente dito */}
      <div
        className={`absolute inset-0 overflow-hidden bg-black ${
          docked
            ? "rounded-2xl shadow-2xl ring-1 ring-white/20"
            : "rounded-[1.7rem] ring-1 ring-white/10"
        }`}
      >
        <video
          ref={videoRef}
          src={src}
          autoPlay
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

  return (
    <div ref={holderRef} className="relative aspect-[9/16] w-full">
      {/* Placeholder no espaco inline enquanto o video esta no mini-player */}
      {docked && (
        <div className="absolute inset-0 grid place-items-center rounded-[1.7rem] border border-dashed border-white/15 bg-white/[0.02] px-4 text-center text-xs text-white/45">
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-[var(--color-pmb-lime)]" />
            Reproduzindo no canto da tela
          </span>
        </div>
      )}

      {rect && createPortal(frame, document.body)}
    </div>
  )
}
