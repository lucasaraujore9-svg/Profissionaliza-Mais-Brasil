"use client"

import { useEffect } from "react"
import { clientLogger } from "@/lib/logger-client"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        })

        // Atualizacao disponivel: instala silenciosamente
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage("SKIP_WAITING")
            }
          })
        })
      } catch (err) {
        clientLogger.warn({ err: String(err), event: "sw.register_failed" }, "Service worker register falhou")
      }
    }

    if (document.readyState === "complete") {
      void register()
    } else {
      window.addEventListener("load", register, { once: true })
    }
  }, [])

  return null
}
