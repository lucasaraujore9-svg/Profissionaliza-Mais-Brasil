import { Check } from "lucide-react"

export function SuccessIcon() {
  return (
    <div className="relative mx-auto h-24 w-24">
      <div className="absolute inset-0 animate-ping rounded-full bg-[var(--color-pmb-lime)] opacity-25" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-pmb-lime-50)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-pmb-green)] shadow-lg shadow-[rgba(2,89,24,0.35)]">
          <Check className="h-9 w-9 stroke-[3] text-white" />
        </div>
      </div>
    </div>
  )
}
