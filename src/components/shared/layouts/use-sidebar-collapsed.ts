"use client"

import { useCallback, useEffect, useState } from "react"

/** Nome do cookie que guarda a preferência de menu recolhido (admin + painel). */
export const SIDEBAR_COLLAPSED_COOKIE = "pmb_sidebar_collapsed"

/**
 * Estado do menu lateral recolhido, persistido em cookie. O layout do App Router
 * é lido no servidor (sem flash de hidratação) e o cookie sobrevive a reload e a
 * troca de tela — enquanto o layout permanece montado, o próprio estado React já
 * persiste na navegação.
 */
export function useSidebarCollapsed(defaultCollapsed: boolean) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    // 1 ano; path=/ para valer em /admin e /painel; Lax é suficiente (só UI).
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
  }, [collapsed])

  const toggle = useCallback(() => setCollapsed((prev) => !prev), [])

  return { collapsed, toggle }
}
