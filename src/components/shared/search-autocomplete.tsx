"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"

interface Suggestion {
  slug: string
  nome: string
  categoria: string | null
}

interface SearchAutocompleteProps {
  id: string
  placeholder: string
  defaultValue?: string
  /** Classes do <input> — cada contexto (hero, navbar, /cursos) tem o seu estilo. */
  inputClassName: string
  /** Classes do wrapper relativo que ancora o dropdown. */
  wrapperClassName?: string
  /** Base do link de detalhe do curso: "/cursos" (site PMB) ou "/curso" (vitrine). */
  courseHrefBase?: string
}

const DEBOUNCE_MS = 200

/**
 * Input de busca com sugestões em tempo real (a partir da 1ª letra).
 * Mantém `name="q"` para que o submit do <form> pai (botão Buscar/Enter)
 * continue levando para a página de resultados. As sugestões vêm de
 * /api/catalogo/sugestoes, que é tenant-aware.
 */
export function SearchAutocomplete({
  id,
  placeholder,
  defaultValue = "",
  inputClassName,
  wrapperClassName = "relative flex-1",
  courseHrefBase = "/cursos",
}: SearchAutocompleteProps) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  // Termo digitado pelo usuário (não inclui o defaultValue vindo da URL):
  // evita abrir o dropdown sozinho ao carregar /cursos?q=...
  const [term, setTerm] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!term) return
    const controller = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalogo/sugestoes?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        )
        if (!res.ok) return
        const json = (await res.json()) as { data?: Suggestion[] }
        const data = json.data ?? []
        setSuggestions(data)
        setActiveIndex(-1)
        setOpen(data.length > 0)
      } catch {
        // Abort/erros de rede: mantém o estado atual (busca via submit continua funcionando)
      }
    }, DEBOUNCE_MS)
    return () => {
      controller.abort()
      window.clearTimeout(t)
    }
  }, [term])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setQ(value)
    const trimmed = value.trim()
    setTerm(trimmed)
    if (!trimmed) {
      setSuggestions([])
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (!open || suggestions.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      setOpen(false)
      router.push(`${courseHrefBase}/${suggestions[activeIndex].slug}`)
    }
  }

  const listboxId = `${id}-listbox`

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      <input
        id={id}
        name="q"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={q}
        placeholder={placeholder}
        className={inputClassName}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0 && term) setOpen(true)
        }}
      />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[340px] overflow-y-auto rounded-xl border border-[rgba(2,89,24,0.1)] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(2,89,24,0.35)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.slug} role="option" aria-selected={i === activeIndex}>
              <Link
                href={`${courseHrefBase}/${s.slug}`}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left ${
                  i === activeIndex ? "bg-[var(--color-pmb-mist)]" : ""
                }`}
              >
                <Search
                  className="h-3.5 w-3.5 shrink-0 text-[rgba(2,89,24,0.45)]"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--color-pmb-green)]">
                    {s.nome}
                  </span>
                  {s.categoria && (
                    <span className="block truncate text-[11.5px] text-[rgba(2,89,24,0.55)]">
                      {s.categoria}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
