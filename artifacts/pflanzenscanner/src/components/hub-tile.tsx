import type { ComponentType, MouseEvent } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * One area of a hub page (Pflanzen, Tiere): coloured icon, name, short hint.
 * Both hubs use it so they look the same.
 */
export function HubTile({
  href,
  icon: Icon,
  label,
  hint,
  tone,
  badge,
  tag,
  className: extra,
  onClick,
  active,
}: {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint: string;
  /** Background and text colour of the icon square. */
  tone: string;
  /** A small count in the corner, e.g. open duties. */
  badge?: string | null;
  /** A small label next to the name, e.g. "Lite" or "Premium". */
  tag?: string | null;
  /** E.g. col-span-2 for a tile across the whole row. */
  className?: string;
  /** In-page tiles that open a section instead of jumping (Verwaltung). */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** The section of this tile is open. */
  active?: boolean;
}) {
  const inner = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tone)}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </span>
        {badge && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-medium text-amber-950">{badge}</span>}
      </span>
      <span>
        <span className="block text-sm font-semibold leading-tight">
          {label}
          {tag && <span className="ml-1.5 inline-block rounded-full border border-primary/40 px-1.5 py-px align-middle text-[10px] font-medium text-primary">{tag}</span>}
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </>
  );
  const className = cn("rounded-2xl border bg-card p-4 flex flex-col gap-3 hover:shadow-md active:scale-[0.98] transition-all", extra);
  // In-page anchors (Verwaltung's sections) are plain links; pages are router links.
  return href.startsWith("#") ? (
    <a href={href} className={className} onClick={onClick} aria-expanded={active}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/** The tile grid of a hub page. */
export function HubGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
