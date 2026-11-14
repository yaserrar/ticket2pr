import { cn } from "~/lib/utils"

// CSS ring spinner (no icon dependency). Inherits `currentColor`.
function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80 motion-reduce:animate-[spin_1.5s_linear_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
