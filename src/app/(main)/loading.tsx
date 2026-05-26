import { Skeleton } from "@/components/ui/skeleton"

export default function MainLoading() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
