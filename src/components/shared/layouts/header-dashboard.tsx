"use client"

import { Menu, Bell, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

interface HeaderDashboardProps {
  mobileNav: React.ReactNode
  userName?: string
  onSignOut?: () => void
}

export function HeaderDashboard({
  mobileNav,
  userName,
  onSignOut,
}: HeaderDashboardProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[rgba(2,89,24,0.1)] bg-white px-4 lg:px-6">
      <Sheet>
        <SheetTrigger
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)] lg:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          {mobileNav}
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="relative text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
      >
        <Bell className="h-5 w-5" />
        <span className="sr-only">Notificações</span>
      </Button>

      {userName && (
        <span className="hidden sm:inline text-sm font-medium text-[var(--color-pmb-green)]">
          {userName}
        </span>
      )}

      {onSignOut && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSignOut}
          className="text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]"
        >
          <LogOut className="h-5 w-5" />
          <span className="sr-only">Sair</span>
        </Button>
      )}
    </header>
  )
}
