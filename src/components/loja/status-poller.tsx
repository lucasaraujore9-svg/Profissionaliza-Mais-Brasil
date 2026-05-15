"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const POLL_INTERVAL_MS = 4000
const MAX_ATTEMPTS = 75 // ~5 minutos

interface StatusPollerProps {
  enrollmentId: string
  initialStatus: string
}

export function StatusPoller({ enrollmentId, initialStatus }: StatusPollerProps) {
  const router = useRouter()

  useEffect(() => {
    if (initialStatus !== "PENDING") return

    let attempts = 0
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      attempts += 1
      try {
        const res = await fetch(
          `/api/checkout/confirmacao/${enrollmentId}/status`,
          { cache: "no-store" },
        )
        if (!res.ok) return
        const json = await res.json()
        const status = json?.data?.status as string | undefined
        if (status && status !== "PENDING") {
          router.refresh()
          cancelled = true
          return
        }
      } catch {
        // silencioso — tenta de novo no próximo tick
      }
      if (attempts >= MAX_ATTEMPTS) {
        cancelled = true
      }
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enrollmentId, initialStatus, router])

  return null
}
