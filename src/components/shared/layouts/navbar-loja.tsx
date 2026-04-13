"use client"

import Link from "next/link"
import { ShoppingCart, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NavbarLojaProps {
  tenantName?: string
}

export function NavbarLoja({ tenantName }: NavbarLojaProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="text-xl font-bold text-gray-900">
          {tenantName ?? "Cursos Online"}
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <Link href="/" className="hover:text-gray-900 transition-colors">
            Início
          </Link>
          <Link href="/cursos" className="hover:text-gray-900 transition-colors">
            Cursos
          </Link>
          <Link href="/sobre" className="hover:text-gray-900 transition-colors">
            Sobre
          </Link>
          <Link href="/contato" className="hover:text-gray-900 transition-colors">
            Contato
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Search className="h-5 w-5 text-gray-600" />
            <span className="sr-only">Buscar</span>
          </Button>
          <Button variant="ghost" size="icon" className="relative">
            <ShoppingCart className="h-5 w-5 text-gray-600" />
            <span className="sr-only">Carrinho</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
