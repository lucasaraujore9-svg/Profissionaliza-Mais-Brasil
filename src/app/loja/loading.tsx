import { Skeleton } from "@/components/ui/skeleton"

export default function LojaLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  )
}
