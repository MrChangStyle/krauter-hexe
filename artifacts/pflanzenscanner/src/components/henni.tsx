import { cn } from "@/lib/utils";

/**
 * Henni – the Little Farming mascot (design: a flat white hen on a lime
 * circle). Gives tips; never used for safety warnings.
 */
export function HenniAvatar({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="32" cy="32" r="32" fill="#B9E36A" />
      <path d="M14 34l-6-9 10 3z" fill="#FFFFFF" />
      <ellipse cx="30" cy="41" rx="17" ry="14" fill="#FFFFFF" />
      <path d="M21 41a9 6 0 0 0 17 0z" fill="#E4EADC" />
      <circle cx="38" cy="26" r="10" fill="#FFFFFF" />
      <circle cx="34" cy="15.5" r="3.5" fill="#E2683C" />
      <circle cx="39.5" cy="14.5" r="3.5" fill="#E2683C" />
      <circle cx="40.5" cy="25" r="1.9" fill="#14281D" />
      <path d="M47.5 25l6 2.2-6 2.6z" fill="#F2A93B" />
    </svg>
  );
}

/** Henni with a speech bubble. */
export function HenniTip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm", className)}>
      <HenniAvatar />
      <p className="min-w-0 leading-snug">{children}</p>
    </div>
  );
}
