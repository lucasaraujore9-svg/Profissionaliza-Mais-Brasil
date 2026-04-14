"use client"

import { useState } from "react"

const categorias = [
  { slug: "todos", nome: "Todos" },
  { slug: "tecnologia", nome: "Tecnologia" },
  { slug: "marketing", nome: "Marketing" },
  { slug: "administracao", nome: "Administração" },
  { slug: "saude", nome: "Saúde" },
]

export function CategoryPills() {
  const [active, setActive] = useState("todos")

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-4 md:px-6">
        {categorias.map((cat) => {
          const isActive = active === cat.slug
          return (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setActive(cat.slug)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {cat.nome}
            </button>
          )
        })}
      </div>
    </div>
  )
}
