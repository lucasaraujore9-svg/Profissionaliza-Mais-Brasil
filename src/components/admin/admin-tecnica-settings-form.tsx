"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, ExternalLink, Loader2, Save } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TecnicaCoursesEditor,
  type TecnicaCourseDraft,
} from "./tecnica-courses-editor"

interface InitialValues {
  enabled: boolean
  url: string | null
  label: string | null
  courses: TecnicaCourseDraft[]
}

export function AdminTecnicaSettingsForm({
  initial,
}: {
  initial: InitialValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [url, setUrl] = useState(initial.url ?? "")
  const [label, setLabel] = useState(initial.label ?? "")
  const [courses, setCourses] = useState<TecnicaCourseDraft[]>(initial.courses)

  function submit() {
    const trimmedUrl = url.trim()
    if (enabled && !trimmedUrl) {
      toast.error("Informe a URL da escola técnica para ativar")
      return
    }
    if (enabled && trimmedUrl) {
      try {
        new URL(trimmedUrl)
      } catch {
        toast.error("URL inválida (use https://...)")
        return
      }
    }
    // Valida cursos antes de enviar
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i]
      if (!c.name.trim()) {
        toast.error(`Curso #${i + 1}: nome obrigatório`)
        return
      }
      if (c.url.trim()) {
        try {
          new URL(c.url.trim())
        } catch {
          toast.error(`Curso #${i + 1}: URL inválida`)
          return
        }
      }
    }

    startTransition(async () => {
      const res = await fetch("/api/admin/system-settings/tecnica", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          url: trimmedUrl || null,
          label: label.trim() || null,
          courses: courses.map((c, i) => ({
            name: c.name.trim(),
            url: c.url.trim(),
            image: c.image?.trim() || "",
            order: i,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(enabled ? "Unidade Técnica ativada" : "Unidade Técnica desativada")
      router.refresh()
    })
  }

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-mist)] p-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" />
        <div className="text-xs text-[var(--color-pmb-green-900)]">
          Ao ativar, o site institucional exibe um card de categoria, um item
          de menu e uma seção “Cursos Técnicos” com a lista de cursos abaixo.
          Cada curso pode ter URL própria; sem URL, usa a base configurada acima.
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Unidade Técnica ativa no site PMB
        </Label>
      </div>

      <div className="space-y-2">
        <Label>URL da escola técnica</Label>
        <div className="flex items-center gap-2">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://escolatecnicadobrasil.com.br/"
          />
          {url.trim() && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-gray-200 bg-white p-2 text-gray-500 hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green)]"
              title="Testar link"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
        <p className="text-xs text-gray-500">
          URL base usada como fallback quando um curso não tem URL própria.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Rótulo (opcional)</Label>
        <Input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Cursos Técnicos"
          maxLength={60}
        />
        <p className="text-xs text-gray-500">
          Como o card e o item de menu aparecem. Vazio = “Cursos Técnicos”.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-4">
        <TecnicaCoursesEditor
          courses={courses}
          onChange={setCourses}
          fallbackUrl={url.trim() || null}
          disabled={pending}
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Salvar
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
