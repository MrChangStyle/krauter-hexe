import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { MODULE_LOOK, backOf, type LookKey } from "@/lib/module-look";
import { cn } from "@/lib/utils";

/**
 * The top of every module page (docs/DESIGN.md): back to the area, the module's
 * icon square in its colour as on the hub tile, title, one line on what the
 * page is for, and room for an action on the right.
 */
export function PageHeader({
  look,
  title,
  subtitle,
  actions,
  back = true,
}: {
  look: LookKey;
  /** Defaults to the module's name. */
  title?: ReactNode;
  /** Defaults to the module's hint. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: boolean;
}) {
  const m = MODULE_LOOK[look];
  const to = backOf(look);
  const Icon = m.icon;
  return (
    <div className="space-y-3" data-testid="page-header">
      {back && (
        <Link href={to.href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {to.label}
        </Link>
      )}
      <div className="flex items-start gap-3">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", m.tone)}>
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{title ?? m.label}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle ?? m.hint}</p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
