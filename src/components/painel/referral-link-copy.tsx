"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function ReferralLinkCopy({
  link,
  code,
}: {
  link: string
  code: string
}) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Link copiado!")
      setTimeout(() => setCopied(false), 2200)
    } catch {
      toast.error("Nao foi possivel copiar")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 break-all">
          {link}
        </div>
        <Button onClick={copyLink} type="button">
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar link
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Codigo da indicacao:{" "}
        <span className="font-mono font-semibold">{code}</span>
      </p>
    </div>
  )
}
