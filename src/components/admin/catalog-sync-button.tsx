"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CatalogSyncButton() {
  const [syncing, setSyncing] = useState(false)

  const handle = () => {
    setSyncing(true)
    setTimeout(() => setSyncing(false), 1500)
  }

  return (
    <Button
      onClick={handle}
      disabled={syncing}
      className="bg-blue-600 text-white hover:bg-blue-700"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Sincronizando..." : "Sincronizar com Escola Avançada"}
    </Button>
  )
}
