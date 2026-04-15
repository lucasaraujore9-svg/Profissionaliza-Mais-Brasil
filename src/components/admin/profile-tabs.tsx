"use client"

import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import { Loader2, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ProfileAccountForm,
  type AdminProfile,
} from "./profile-account-form"
import { ProfileSecurityForm } from "./profile-security-form"

const tabs = [
  { id: "conta", label: "Conta" },
  { id: "seguranca", label: "Segurança" },
] as const

type TabId = (typeof tabs)[number]["id"]

export function ProfileTabs() {
  const [active, setActive] = useState<TabId>("conta")
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/me")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar")
        return json.data.user as AdminProfile
      })
      .then((result) => {
        if (!cancelled) setProfile(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Erro ao carregar")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando perfil...
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                active === tab.id
                  ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
                  : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair da conta
        </Button>
      </div>

      <div className="mt-6">
        {active === "conta" && (
          <ProfileAccountForm data={profile} onUpdate={setProfile} />
        )}
        {active === "seguranca" && <ProfileSecurityForm />}
      </div>
    </div>
  )
}
