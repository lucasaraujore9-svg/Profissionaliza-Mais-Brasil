"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CopyableText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Copiado!")
      setTimeout(() => setCopied(false), 2200)
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 font-sans text-xs leading-relaxed text-gray-700">
        {text}
      </p>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={copy}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copiar mensagem
          </>
        )}
      </Button>
    </div>
  )
}
