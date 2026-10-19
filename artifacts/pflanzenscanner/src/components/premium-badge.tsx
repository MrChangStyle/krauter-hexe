import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks what will be part of the paid garden module later (spec: build
 * without a lock while there is no payment, only mark it).
 */
export function PremiumBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-[#B9E36A] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#14281D]",
        className,
      )}
    >
      <Sparkles className="h-2.5 w-2.5" />
      Premium
    </span>
  );
}
