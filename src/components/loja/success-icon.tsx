import { Check } from "lucide-react"

export function SuccessIcon() {
  return (
    <div className="relative mx-auto h-24 w-24">
      <div className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-20" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30">
          <Check className="h-9 w-9 stroke-[3] text-white" />
        </div>
      </div>
    </div>
  )
}
