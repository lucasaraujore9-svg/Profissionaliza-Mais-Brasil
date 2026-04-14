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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
      <Sheet>
        <SheetTrigger
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 lg:hidden"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          {mobileNav}
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-5 w-5 text-gray-600" />
        <span className="sr-only">Notificações</span>
      </Button>

      {userName && (
        <span className="hidden sm:inline text-sm text-gray-600">
          {userName}
        </span>
      )}

      {onSignOut && (
        <Button variant="ghost" size="icon" onClick={onSignOut}>
          <LogOut className="h-5 w-5 text-gray-600" />
          <span className="sr-only">Sair</span>
        </Button>
      )}
    </header>
  )
}
