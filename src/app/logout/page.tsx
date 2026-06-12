"use client"

import { useEffect } from "react"
import { signOutToLogin } from "@/lib/auth/sign-out"
import { Loader2 } from "lucide-react"

export default function LogoutPage() {
  useEffect(() => {
    void signOutToLogin()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-pmb-mist)]">
      <div className="flex items-center gap-3 text-sm font-medium text-[var(--color-pmb-green-900)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Encerrando sua sessão...
      </div>
    </div>
  )
}
