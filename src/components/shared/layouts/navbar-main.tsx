"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function NavbarMain() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Profissionaliza <span className="text-blue-600">Mais Brasil</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
          <Link href="/#como-funciona" className="hover:text-gray-900 transition-colors">
            Como Funciona
          </Link>
          <Link href="/#cursos" className="hover:text-gray-900 transition-colors">
            Cursos
          </Link>
          <Link href="/#planos" className="hover:text-gray-900 transition-colors">
            Planos
          </Link>
          <Link href="/seja-revendedor" className="hover:text-gray-900 transition-colors">
            Seja Revendedor
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link href="/seja-revendedor">
            <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
              Começar Agora
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
