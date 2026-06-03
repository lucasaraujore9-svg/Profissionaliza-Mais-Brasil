"use client"

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface TecnicaCourseDraft {
  name: string
  url: string
  /** Imagem fixa do curso (URL https:// ou caminho público /...). Opcional. */
  image?: string
}

interface TecnicaCoursesEditorProps {
  /** Lista atual em ordem de exibição. */
  courses: TecnicaCourseDraft[]
  onChange: (next: TecnicaCourseDraft[]) => void
  /**
   * URL base usada quando o curso não tem URL específica. Aparece como
   * placeholder pra deixar claro o fallback.
   */
  fallbackUrl?: string | null
  disabled?: boolean
}

const MAX_COURSES = 12

export function TecnicaCoursesEditor({
  courses,
  onChange,
  fallbackUrl,
  disabled,
}: TecnicaCoursesEditorProps) {
  const update = (i: number, patch: Partial<TecnicaCourseDraft>) => {
    const next = courses.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    onChange(next)
  }

  const remove = (i: number) => {
    onChange(courses.filter((_, idx) => idx !== i))
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= courses.length) return
    const next = [...courses]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    onChange(next)
  }

  const add = () => {
    if (courses.length >= MAX_COURSES) return
    onChange([...courses, { name: "", url: "", image: "" }])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Cursos listados</Label>
        <span className="text-[11px] text-gray-500">
          {courses.length} / {MAX_COURSES}
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-500">
          Sem cursos cadastrados. O card mostrará apenas o botão “Conhecer”.
        </div>
      ) : (
        <ul className="space-y-2">
          {courses.map((c, i) => (
            <li
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={c.name}
                  disabled={disabled}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Nome do curso (ex: Técnico em Segurança do Trabalho)"
                  maxLength={120}
                />
                <Input
                  type="url"
                  value={c.url}
                  disabled={disabled}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder={fallbackUrl ?? "https://… (opcional)"}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={disabled || i === 0}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Subir"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={disabled || i === courses.length - 1}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Descer"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={disabled}
                    className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Input
                type="text"
                value={c.image ?? ""}
                disabled={disabled}
                onChange={(e) => update(i, { image: e.target.value })}
                placeholder="Imagem do curso — https://… ou /images/tecnica/arquivo.jpg (opcional)"
                className="mt-2"
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        disabled={disabled || courses.length >= MAX_COURSES}
      >
        <Plus className="mr-1 h-4 w-4" />
        Adicionar curso
      </Button>
      <p className="text-[11px] text-gray-500">
        URL vazia usa a URL base da escola técnica como destino.
      </p>
    </div>
  )
}
