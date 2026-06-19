"use client"

import { useState } from "react"
import { Eye, EyeOff, Loader2, GraduationCap, Server } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PROVIDER_LABEL, type CourseProvider } from "./catalog-course-grid"

interface ProviderBulkActionsProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  counts: Record<CourseProvider, number>
  /** Chamado após aplicar com sucesso (o pai recarrega o catálogo). */
  onApplied?: () => void
}

const PROVIDERS: { value: CourseProvider; icon: typeof Server }[] = [
  { value: "EA", icon: GraduationCap },
  { value: "LMS", icon: Server },
]

export function ProviderBulkActions({
  open,
  onOpenChange,
  counts,
  onApplied,
}: ProviderBulkActionsProps) {
  const [provider, setProvider] = useState<CourseProvider>("EA")
  const [pending, setPending] = useState<"show" | "hide" | null>(null)

  const apply = async (action: "show" | "hide") => {
    setPending(action)
    try {
      const res = await fetch("/api/admin/catalogo/bulk-provider-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao aplicar")
        return
      }
      const count = body.data?.count ?? 0
      toast.success(
        action === "show"
          ? `${count} curso(s) de ${PROVIDER_LABEL[provider]} exibido(s) na vitrine.`
          : `${count} curso(s) de ${PROVIDER_LABEL[provider]} ocultado(s) da vitrine.`,
      )
      onApplied?.()
    } catch {
      toast.error("Erro de rede ao aplicar")
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exibir ou ocultar por plataforma</DialogTitle>
          <DialogDescription>
            Mostra ou esconde de uma só vez todos os cursos de uma fornecedora na
            vitrine principal da PMB. Não afeta a publicação na plataforma de
            origem nem a visibilidade por revenda — você ainda pode ajustar curso
            a curso pelo botão Editar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seleção da plataforma */}
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Plataforma
            </span>
            <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
              {PROVIDERS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProvider(value)}
                  aria-pressed={provider === value}
                  disabled={pending !== null}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    provider === value
                      ? "bg-white text-[var(--color-pmb-green-900)] shadow-sm"
                      : "text-gray-500 hover:text-[var(--color-pmb-green-900)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {PROVIDER_LABEL[value]}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      provider === value
                        ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {counts[value] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => apply("show")}
              disabled={pending !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
            >
              {pending === "show" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Exibir todos
            </button>
            <button
              type="button"
              onClick={() => apply("hide")}
              disabled={pending !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              {pending === "hide" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              Ocultar todos
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
