"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { ExternalLink } from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

export interface VitrineTab {
  value: string
  label: string
  /** ReactNode (server-rendered) que é injetado dentro do TabsContent. */
  content: React.ReactNode
}

interface VitrineTabsShellProps {
  tabs: VitrineTab[]
  /** Aba mostrada quando nenhuma está selecionada via URL. */
  defaultValue?: string
  /** Link absoluto pro preview público (abre em nova aba). Opcional. */
  previewUrl?: string | null
}

/**
 * Shell com abas para as páginas /admin/vitrine e /painel/vitrine.
 * - Preserva aba selecionada na URL via `?tab=...` (deep-link / refresh).
 * - Renderiza um botão "Ver como fica" se `previewUrl` for fornecido.
 */
export function VitrineTabsShell({
  tabs,
  defaultValue,
  previewUrl,
}: VitrineTabsShellProps) {
  const router = useRouter()
  const params = useSearchParams()

  const fromUrl = params.get("tab") ?? undefined
  const active =
    tabs.find((t) => t.value === fromUrl)?.value ??
    defaultValue ??
    tabs[0]?.value

  const handleChange = useCallback(
    (value: string | number | null) => {
      if (typeof value !== "string") return
      const next = new URLSearchParams(params)
      next.set("tab", value)
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={active} onValueChange={handleChange} className="flex-1 min-w-[260px]">
          <TabsList
            data-tour="vitrine:tabs"
            className="flex w-full flex-wrap justify-start gap-1 bg-[var(--color-pmb-mist,#f7faf7)] p-1"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                data-tour={`vitrine:tab:${t.value}`}
                className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)] data-active:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            data-tour="vitrine:preview"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-pmb-green,#025918)]/30 bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-pmb-green,#025918)] transition hover:bg-[var(--color-pmb-mist,#f7faf7)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Ver como fica
          </a>
        )}
      </div>

      <Tabs value={active} onValueChange={handleChange}>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="space-y-6 pt-2">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
