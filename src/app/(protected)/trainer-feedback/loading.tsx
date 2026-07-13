import { Skeleton } from '@/components/ui/Skeleton'

export default function TrainerFeedbackLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="mt-6 h-64 rounded-xl" />
    </div>
  )
}
