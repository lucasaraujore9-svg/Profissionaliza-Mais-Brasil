"use client"

import { useState } from "react"
import { Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function CouponField() {
  const [code, setCode] = useState("")

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <label
        htmlFor="cupom"
        className="flex items-center gap-1.5 text-xs font-medium text-gray-600"
      >
        <Tag className="h-3.5 w-3.5" />
        Tem um cupom de desconto?
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id="cupom"
          placeholder="DIGITE O CUPOM"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="h-9 font-mono text-sm uppercase"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={code.length === 0}
        >
          Aplicar
        </Button>
      </div>
    </div>
  )
}
