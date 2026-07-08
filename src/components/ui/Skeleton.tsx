interface SkeletonProps {
  className?: string
}

/** Shimmering placeholder block — size it with width/height utilities via className */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden />
}
