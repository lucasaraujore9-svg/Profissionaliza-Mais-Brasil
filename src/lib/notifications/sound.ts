// Player de som de notificacao, com:
//  - preferencia persistida em localStorage (key NOTIF_SOUND_KEY)
//  - throttle: nao toca se ja tocou ha menos de MIN_INTERVAL_MS
//  - silencioso quando aba esta hidden (evita "ataque" sonoro ao voltar)
//  - tolerante a autoplay policy: a 1a interacao do usuario destrava o audio
//
// Uso:
//   import { playNotificationSound, setNotificationSoundEnabled, isNotificationSoundEnabled } from "@/lib/notifications/sound"
//   playNotificationSound()

const NOTIF_SOUND_KEY = "pmb:notif:sound"
const SOUND_URL = "/sounds/notification.wav"
const MIN_INTERVAL_MS = 3_000

let lastPlayedAt = 0
let cachedAudio: HTMLAudioElement | null = null
let unlocked = false

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

export function isNotificationSoundEnabled(): boolean {
  if (!isBrowser()) return false
  try {
    const v = window.localStorage.getItem(NOTIF_SOUND_KEY)
    // default = ligado
    return v === null ? true : v === "1"
  } catch {
    return true
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(NOTIF_SOUND_KEY, enabled ? "1" : "0")
  } catch {
    /* storage off */
  }
}

function getAudio(): HTMLAudioElement | null {
  if (!isBrowser()) return null
  if (cachedAudio) return cachedAudio
  const a = new Audio(SOUND_URL)
  a.preload = "auto"
  a.volume = 0.55
  cachedAudio = a
  return a
}

// Browsers bloqueiam Audio antes da 1a interacao. Esta chamada deve ser feita
// dentro de um handler de evento de usuario (click, keydown, touchend) — uma
// vez destravado, podemos tocar programaticamente depois.
export function unlockNotificationSound(): void {
  if (!isBrowser() || unlocked) return
  const a = getAudio()
  if (!a) return
  // toca em volume zero e pausa imediatamente para destravar a policy
  const prev = a.volume
  a.volume = 0
  void a
    .play()
    .then(() => {
      a.pause()
      a.currentTime = 0
      a.volume = prev
      unlocked = true
    })
    .catch(() => {
      a.volume = prev
    })
}

interface PlayOptions {
  /** Forca tocar mesmo com aba escondida (default: false) */
  force?: boolean
  /** Ignora a preferencia do usuario (use com cuidado — default: false) */
  ignorePreference?: boolean
}

export function playNotificationSound(options: PlayOptions = {}): void {
  if (!isBrowser()) return
  if (!options.ignorePreference && !isNotificationSoundEnabled()) return
  if (!options.force && document.visibilityState === "hidden") return

  const now = Date.now()
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return
  lastPlayedAt = now

  const a = getAudio()
  if (!a) return
  try {
    a.currentTime = 0
  } catch {
    /* alguns browsers reclamam antes do load */
  }
  void a.play().catch(() => {
    // autoplay bloqueado — sera destravado na proxima interacao do usuario
  })
}
