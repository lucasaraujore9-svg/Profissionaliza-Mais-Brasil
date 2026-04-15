"use client"

import Link from "next/link"
import Image from "next/image"
import { ShoppingCart, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NavbarLojaProps {
  tenantName?: string
  tenantLogoUrl?: string
}

export function NavbarLoja({ tenantName, tenantLogoUrl }: NavbarLojaProps) {
  return (
    <header className="sticky top-0 z-40 bg-white shadow-[0_1px_0_0_rgba(2,89,24,0.08)]">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 shrink-0"
          aria-label={tenantName ?? "Cursos Online"}
        >
          {tenantLogoUrl ? (
            <Image
              src={tenantLogoUrl}
              alt={tenantName ?? "Logo"}
              width={160}
              height={48}
              className="h-12 w-auto"
            />
          ) : (
            <span className="font-display text-xl text-[var(--color-pmb-green)]">
              {tenantName ?? "Cursos Online"}
            </span>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--color-pmb-green)]">
          <Link href="/" className="hover:underline underline-offset-4">
            Início
          </Link>
          <Link href="/cursos" className="hover:underline underline-offset-4">
            Cursos
          </Link>
          <Link href="/sobre" className="hover:underline underline-offset-4">
            Sobre
          </Link>
          <Link href="/contato" className="hover:underline underline-offset-4">
            Contato
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]">
            <Search className="h-5 w-5" />
            <span className="sr-only">Buscar</span>
          </Button>
          <Button variant="ghost" size="icon" className="relative text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]">
            <ShoppingCart className="h-5 w-5" />
            <span className="sr-only">Carrinho</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
