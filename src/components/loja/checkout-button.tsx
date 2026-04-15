import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CheckoutButton() {
  return (
    <div className="space-y-3">
      <Link href="/loja/confirmacao" className="block">
        <Button
          size="lg"
          className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <Lock className="mr-2 h-4 w-4" />
          Finalizar Compra
        </Button>
      </Link>
      <p className="text-center text-xs text-gray-500">
        Seus dados estão protegidos com criptografia SSL de 256 bits.
      </p>
    </div>
  )
}
