import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        "before:bg-[linear-gradient(110deg,transparent_30%,hsl(var(--card)/0.7)_50%,transparent_70%)]",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
