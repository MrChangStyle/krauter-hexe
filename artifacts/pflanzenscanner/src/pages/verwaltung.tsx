import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, Crown, Flag, MessageCircle, NotebookPen, Trash2, Users, X } from "lucide-react";
import { CropDraftsCard } from "@/components/crop-drafts-card";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { ModerationCard } from "@/components/moderation-card";
import { FeedbackCard } from "@/components/feedback-card";
import { OperationsCard } from "@/components/operations-card";
import { OrphanCleanupCard } from "@/components/orphan-cleanup-card";
import { PremiumAdminCard } from "@/components/premium-admin-card";
import { RecipeDraftsCard } from "@/components/recipe-drafts-card";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Benutzerverwaltung } from "@/pages/mehr";

interface Section {
  id: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint: string;
  tone: string;
  render: () => ReactNode;
}

/** The owner's areas: a tile each, the section opens only when its tile is tapped. */
const SECTIONS: Section[] = [
  { id: "feedback", icon: MessageCircle, label: "Feedback", hint: "Ideen und Wünsche der Tester", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", render: () => <FeedbackCard /> },
  { id: "betrieb", icon: Activity, label: "Betrieb", hint: "Fehler, Status, Nutzung", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", render: () => <OperationsCard /> },
  { id: "moderation", icon: Flag, label: "Moderation", hint: "Gemeldete Inhalte", tone: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300", render: () => <ModerationCard /> },
  {
    id: "entwuerfe",
    icon: NotebookPen,
    label: "Entwürfe",
    hint: "Pflanzen & Futter-Rezepte",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    render: () => (
      <div className="space-y-5">
        <CropDraftsCard />
        <RecipeDraftsCard />
      </div>
    ),
  },
  { id: "premium", icon: Crown, label: "Premium", hint: "Per Hand vergeben", tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300", render: () => <PremiumAdminCard /> },
  { id: "benutzer", icon: Users, label: "Benutzer", hint: "Freigeben, verwalten", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300", render: () => <Benutzerverwaltung /> },
  { id: "aufraeumen", icon: Trash2, label: "Aufräumen", hint: "Verwaiste Daten", tone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200", render: () => <OrphanCleanupCard /> },
];

/** The section named in the address (#feedback), if any – pushes link straight to it. */
function sectionOfHash(): string | null {
  const id = window.location.hash.slice(1);
  return SECTIONS.some((s) => s.id === id) ? id : null;
}

/**
 * /verwaltung – the owner's tools, moved out of "Mehr". All sections start
 * closed; tapping a tile opens just that one (#id in the address), tapping it
 * again or "Schließen" closes it.
 */
export default function VerwaltungPage() {
  const { user: me } = useAuthContext();
  const [open, setOpen] = useState<string | null>(sectionOfHash);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onHash = () => setOpen(sectionOfHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);
  const toggle = (id: string | null) => {
    const next = id === open ? null : id;
    // The address keeps the open section (back button, reload, links from pushes).
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
    setOpen(next);
  };
  const current = SECTIONS.find((s) => s.id === open);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Verwaltung</h1>
        <p className="text-sm text-muted-foreground mt-1">Betrieb der App – nur für dich als Betreiber.</p>
      </div>

      {!me?.isOwner ? (
        <p className="text-sm text-muted-foreground">Diese Seite gibt es nur für den Betreiber.</p>
      ) : (
        <>
          <HubGrid>
            {SECTIONS.map((s, i) => (
              <HubTile
                key={s.id}
                href={`#${s.id}`}
                icon={s.icon}
                label={s.label}
                hint={s.hint}
                tone={s.tone}
                // Feedback, read most often, takes the full width.
                className={cn(i === 0 && "col-span-2", open === s.id && "border-primary ring-2 ring-primary/40")}
                onClick={(e) => {
                  e.preventDefault();
                  toggle(s.id);
                }}
                active={open === s.id}
              />
            ))}
          </HubGrid>

          {current && (
            <div ref={panel} id={current.id} className="scroll-mt-4 space-y-2" data-testid="verwaltung-section">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground">{current.label}</h2>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => toggle(null)}>
                  <X className="h-4 w-4" />
                  Schließen
                </Button>
              </div>
              {current.render()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
