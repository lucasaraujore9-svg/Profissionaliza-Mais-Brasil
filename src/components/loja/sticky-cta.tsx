import Link from "next/link"
import { Button } from "@/components/ui/button"

interface StickyCTAProps {
  href: string
  preco: string
  parcelas: string | null
}

export function StickyCTA({ href, preco, parcelas }: StickyCTAProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-bold text-[#1A1A2E]">{preco}</div>
          {parcelas && <div className="text-xs text-gray-500">ou {parcelas}</div>}
        </div>
        <Link href={href} className="shrink-0">
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            Matricular-se
          </Button>
        </Link>
      </div>
    </div>
  )
}
