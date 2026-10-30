import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A row of chips that scrolls sideways without a scrollbar: swipe on the
 * phone, arrows left and right from sm on (only while there is more to
 * see in that direction). The vertical padding leaves room for the ring of
 * a chosen chip, which the scroll box would otherwise cut off.
 */
export function ScrollRow({
  children,
  className,
  label,
  testId,
}: {
  children: ReactNode;
  /** Bleed and side padding of the scroll box, e.g. "-mx-4 px-4". */
  className?: string;
  label: string;
  testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const step = (dir: 1 | -1) => box.current?.scrollBy({ left: dir * box.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-foreground shadow-sm hover:bg-muted sm:flex";

  return (
    <div className="relative">
      <div
        ref={box}
        onScroll={measure}
        className={cn("flex gap-1.5 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
        role="group"
        aria-label={label}
        data-testid={testId}
      >
        {children}
      </div>
      {edges.left && (
        <button type="button" className={cn(arrow, "-left-2")} aria-label="Nach links" onClick={() => step(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {edges.right && (
        <button type="button" className={cn(arrow, "-right-2")} aria-label="Nach rechts" onClick={() => step(1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
