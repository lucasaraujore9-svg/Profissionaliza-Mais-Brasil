"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Search, Menu, X, ChevronDown, User } from "lucide-react"
import type { CategoriaInfo } from "@/lib/catalog/home"

const FALLBACK_CATEGORIAS: CategoriaInfo[] = [
  { nome: "Informática e Tecnologia", slug: "informatica", count: 0 },
  { nome: "Administrativo", slug: "administrativo", count: 0 },
  { nome: "Diversas Áreas", slug: "diversas", count: 0 },
  { nome: "Preparatórios", slug: "preparatorios", count: 0 },
  { nome: "Idiomas", slug: "idiomas", count: 0 },
]

interface NavbarMainProps {
  categorias?: CategoriaInfo[]
  tenantLogoUrl?: string | null
  tenantName?: string | null
}

export function NavbarMain({
  categorias,
  tenantLogoUrl,
  tenantName,
}: NavbarMainProps = {}) {
  const lista =
    categorias && categorias.length > 0 ? categorias : FALLBACK_CATEGORIAS
  const [mobileOpen, setMobileOpen] = useState(false)
  const [categoriasOpen, setCategoriasOpen] = useState(false)
  const categoriasRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!categoriasOpen) return
    function handleClick(event: MouseEvent) {
      if (
        categoriasRef.current &&
        !categoriasRef.current.contains(event.target as Node)
      ) {
        setCategoriasOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setCategoriasOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [categoriasOpen])

  return (
    <header className="sticky top-0 z-40 bg-white shadow-[0_1px_0_0_rgba(2,89,24,0.08)]">
      <div className="mx-auto flex h-[80px] max-w-[1280px] items-center gap-3 px-4 md:h-[92px] md:gap-5 md:px-6">
        <Link
          href="/"
          className="flex items-center shrink-0"
          aria-label={tenantName ?? "Profissionaliza Mais Brasil"}
        >
          {tenantLogoUrl ? (
            <Image
              src={tenantLogoUrl}
              alt={tenantName ?? "Logo"}
              width={400}
              height={120}
              priority
              className="h-14 w-auto object-contain md:h-16"
            />
          ) : (
            <Image
              src="/images/logo.png"
              alt="Profissionaliza Mais Brasil"
              width={1536}
              height={1024}
              priority
              className="h-14 w-auto md:h-16"
            />
          )}
        </Link>

        <div
          ref={categoriasRef}
          className="relative hidden lg:block"
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={categoriasOpen}
            onClick={() => setCategoriasOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[14px] font-medium text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)] transition-colors"
          >
            <Menu className="h-4 w-4" aria-hidden />
            Categorias
            <ChevronDown
              className={`h-3.5 w-3.5 opacity-60 transition-transform ${
                categoriasOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
          {categoriasOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-[rgba(2,89,24,0.1)] bg-white p-2 shadow-[0_18px_40px_-18px_rgba(2,89,24,0.35)]"
            >
              <ul className="flex flex-col">
                {lista.map((cat) => (
                  <li key={cat.slug}>
                    <Link
                      href={`/cursos?categoria=${encodeURIComponent(cat.nome)}`}
                      onClick={() => setCategoriasOpen(false)}
                      role="menuitem"
                      className="flex items-center justify-between rounded-md px-3 py-2 text-[13.5px] font-medium text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
                    >
                      <span>{cat.nome}</span>
                      {cat.count > 0 && (
                        <span className="text-[11px] text-[rgba(2,89,24,0.55)]">
                          {cat.count}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-1 border-t border-[rgba(2,89,24,0.08)] pt-2">
                <Link
                  href="/cursos"
                  onClick={() => setCategoriasOpen(false)}
                  className="block rounded-md px-3 py-2 text-[13px] font-bold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
                >
                  Ver todos os cursos →
                </Link>
              </div>
            </div>
          )}
        </div>

        <form
          role="search"
          action="/cursos"
          className="flex-1 max-w-[560px] relative"
        >
          <label htmlFor="navbar-search" className="sr-only">
            Buscar cursos
          </label>
          <Search
            className="h-[18px] w-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-pmb-green)]"
            aria-hidden
          />
          <input
            id="navbar-search"
            name="q"
            type="search"
            placeholder="O que você quer aprender hoje?"
            className="w-full h-11 pl-11 pr-4 rounded-full border border-[rgba(2,89,24,0.18)] bg-white text-[14px] text-[var(--color-pmb-green)] placeholder:text-[rgba(2,89,24,0.55)] focus:outline-none focus:border-[var(--color-pmb-green)] focus:ring-2 focus:ring-[var(--color-pmb-lime)]/60 transition"
          />
        </form>

        <nav className="hidden lg:flex items-center gap-5 text-[14px] font-medium text-[var(--color-pmb-green)]">
          <Link href="/como-funciona" className="hover:underline underline-offset-4">
            Como funciona
          </Link>
          <Link href="/ajuda" className="hover:underline underline-offset-4">
            Ajuda
          </Link>
        </nav>

        <Link
          href="/login"
          className="hidden sm:inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--color-pmb-green)] hover:underline underline-offset-4"
        >
          <User className="h-4 w-4" aria-hidden />
          Entrar
        </Link>

        <Link
          href="/cursos"
          className="hidden md:inline-flex items-center h-10 px-4 rounded-lg bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green)] text-[14px] font-bold hover:bg-[var(--color-pmb-gold-600)] transition-colors whitespace-nowrap"
        >
          Quero estudar
        </Link>

        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden rounded-md p-2 text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden lg:block border-t border-[rgba(2,89,24,0.08)]">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6">
          <ul className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1.5 -mx-1">
            {lista.map((cat, i) => (
              <li key={cat.slug} className="shrink-0">
                <Link
                  href={`/cursos?categoria=${encodeURIComponent(cat.nome)}`}
                  className={`inline-block px-3 py-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors ${
                    i === 0
                      ? "text-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]"
                      : "text-[rgba(2,89,24,0.78)] hover:text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]"
                  }`}
                >
                  {cat.nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-[rgba(2,89,24,0.08)] bg-white">
          <div className="mx-auto max-w-[1280px] px-4 py-3 flex flex-col gap-1">
            <Link
              href="/cursos"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center h-11 px-4 rounded-lg bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green)] text-[14px] font-bold justify-center mb-2"
            >
              Quero estudar
            </Link>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="py-2 text-[15px] font-medium text-[var(--color-pmb-green)]"
            >
              Entrar
            </Link>
            <Link
              href="/como-funciona"
              onClick={() => setMobileOpen(false)}
              className="py-2 text-[15px] font-medium text-[var(--color-pmb-green)]"
            >
              Como funciona
            </Link>
            <Link
              href="/ajuda"
              onClick={() => setMobileOpen(false)}
              className="py-2 text-[15px] font-medium text-[var(--color-pmb-green)]"
            >
              Ajuda
            </Link>
            <div className="mt-2 pt-2 border-t border-[rgba(2,89,24,0.08)]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[rgba(2,89,24,0.55)] mb-1">
                Categorias
              </p>
              <div className="flex flex-wrap gap-1.5 py-1">
                {lista.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/cursos?categoria=${encodeURIComponent(cat.nome)}`}
                    onClick={() => setMobileOpen(false)}
                    className="inline-block px-2.5 py-1 rounded-md bg-[var(--color-pmb-mist)] text-[12px] text-[var(--color-pmb-green)]"
                  >
                    {cat.nome}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
