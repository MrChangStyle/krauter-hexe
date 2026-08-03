import { cn } from "@/lib/utils";

type PeckingChickenProps = {
  /** Rendered pixel size (width). Height scales proportionally. */
  size?: number;
  /** Optional label shown under the chicken. */
  label?: string;
  className?: string;
};

/**
 * Animated "pecking chicken" loading indicator. Pure SVG + CSS keyframes
 * (see index.css) so it works offline and needs no image assets. Used at app
 * start and wherever content is loading.
 */
export function PeckingChicken({ size = 96, label, className }: PeckingChickenProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Wird geladen"}
    >
      <svg
        width={size}
        height={size * (100 / 120)}
        viewBox="0 0 120 100"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Ground */}
        <line
          x1="14"
          y1="90"
          x2="106"
          y2="90"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Seeds on the ground */}
        <circle className="chicken-seed" cx="34" cy="87" r="2.4" fill="#b45309" style={{ animationDelay: "0s" }} />
        <circle className="chicken-seed" cx="43" cy="88" r="2" fill="#92400e" style={{ animationDelay: "0.06s" }} />
        <circle className="chicken-seed" cx="26" cy="88" r="1.8" fill="#a16207" style={{ animationDelay: "0.12s" }} />

        {/* Body group (gentle bob) */}
        <g className="chicken-body">
          {/* Legs */}
          <line x1="66" y1="76" x2="62" y2="89" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
          <line x1="78" y1="76" x2="80" y2="89" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />

          {/* Tail feathers */}
          <path d="M92 58 q18 -6 22 -20 q-4 16 -8 22 q10 -2 14 -12 q-4 14 -14 20 Z" fill="hsl(var(--primary))" fillOpacity="0.55" />

          {/* Body */}
          <ellipse cx="72" cy="60" rx="26" ry="21" fill="hsl(var(--primary))" />
          {/* Wing */}
          <path d="M78 52 q-16 4 -22 18 q16 2 26 -6 q4 -8 -4 -12 Z" fill="hsl(var(--primary))" fillOpacity="0.75" />

          {/* Head group (pecks) */}
          <g className="chicken-head">
            {/* Comb */}
            <circle cx="46" cy="30" r="3.4" fill="#e11d48" />
            <circle cx="52" cy="27" r="3.8" fill="#e11d48" />
            <circle cx="58" cy="29" r="3.2" fill="#e11d48" />
            {/* Head */}
            <circle cx="52" cy="42" r="15" fill="hsl(var(--primary))" />
            {/* Eye */}
            <circle cx="47" cy="39" r="2.6" fill="#0f172a" />
            <circle cx="46" cy="38" r="0.9" fill="#ffffff" />
            {/* Beak */}
            <path d="M39 42 L26 45 L39 49 Z" fill="#f59e0b" />
            {/* Wattle */}
            <path d="M40 50 q-3 6 0 9 q3 -3 4 -8 Z" fill="#e11d48" />
          </g>
        </g>
      </svg>
      {label ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : null}
    </div>
  );
}

export default PeckingChicken;
