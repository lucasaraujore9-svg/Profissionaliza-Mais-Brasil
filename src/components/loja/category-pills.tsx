"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

interface CategoryPillsProps {
  categories: string[]
  activeCategory?: string
}

export function CategoryPills({
  categories,
  activeCategory,
}: CategoryPillsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const active = (activeCategory ?? "todos").toLowerCase()
  const items = [{ slug: "todos", label: "Todos" }, ...categories.map((c) => ({
    slug: c.toLowerCase(),
    label: c,
  }))]

  function setCategory(slug: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (slug === "todos") {
      params.delete("category")
    } else {
      params.set("category", slug)
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`)
    })
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-4 md:px-6">
        {items.map((cat) => {
          const isActive = active === cat.slug
          return (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setCategory(cat.slug)}
              disabled={isPending}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600"
              } disabled:opacity-60`}
            >
              {cat.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
