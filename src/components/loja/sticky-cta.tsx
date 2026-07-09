import Link from "next/link"
import { Button } from "@/components/ui/button"

interface StickyCTAProps {
  href: string
  preco: string
  parcelas: string | null
}

export function StickyCTA({ href, preco, parcelas }: StickyCTAProps) {
  // bg opaco sem backdrop-blur: um `position: fixed` com `backdrop-filter`
  // reamostra a pagina inteira a cada frame de scroll e e um gatilho forte de
  // trilhas de repaint no Android. bg-white solido fica visualmente igual.
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-lg lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-lg font-bold text-[var(--color-pmb-green-900)]">{preco}</div>
          {parcelas && <div className="text-xs text-gray-500">ou {parcelas}</div>}
        </div>
        <Link href={href} className="shrink-0">
          <Button className="bg-[var(--color-pmb-gold)] text-[var(--color-pmb-green-900)] font-bold hover:bg-[var(--color-pmb-gold-600)]">
            Matricular-se
          </Button>
        </Link>
      </div>
    </div>
  )
}
