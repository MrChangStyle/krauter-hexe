import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Leaf, Menu, Sparkles, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FarmScene } from "@/components/site/farm-scene";
import { SCENES, SceneStyles } from "@/components/site/scenes";
import { SiteFeedback } from "@/components/site/site-feedback";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";
import { SITE_NAV, SITE_PATHS, planById, type PlanId } from "@/lib/site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Pictures ─────────────────────────────────────────────────────────────────

/**
 * The drawn picture for a topic (components/site/scenes.tsx) – or, for a
 * topic without its own scene, the farm with the module's icon.
 */
export function SitePhoto({ slot, alt, icon: Icon = Leaf, className = "", tone = "from-emerald-200 to-lime-100" }: { slot: string; alt: string; icon?: LucideIcon; className?: string; tone?: string }) {
  const Scene = SCENES[slot];
  if (Scene) {
    return (
      <div className={`overflow-hidden rounded-3xl shadow-sm ${className}`}>
        <Scene className="h-full w-full" />
      </div>
    );
  }
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${tone} ${className}`} role="img" aria-label={alt}>
      <FarmScene variant="green" className="absolute inset-0 h-full w-full opacity-40" />
      <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-white/80 text-primary shadow-sm dark:bg-black/40">
        <Icon className="h-10 w-10" />
      </span>
    </div>
  );
}

/** A screenshot of the app in a phone frame (public/site/screens). */
export function PhoneShot({ screen, alt, className = "" }: { screen: string; alt: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <div className={`mx-auto w-full max-w-[240px] rounded-[2.2rem] border-[6px] border-stone-800 bg-stone-800 shadow-xl dark:border-stone-600 ${className}`}>
      <img
        src={`${BASE}/site/screens/${screen}.jpg`}
        alt={alt}
        loading="lazy"
        className="aspect-[390/780] w-full rounded-[1.7rem] object-cover object-top"
        onError={() => setMissing(true)}
      />
    </div>
  );
}

export function PlanBadge({ plan }: { plan: Exclude<PlanId, "basis"> }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${plan === "premium" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200"}`}>
      <Sparkles className="h-3 w-3" />
      KI ab {planById(plan).name}
    </span>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export interface SiteActions {
  /** On the start page while signed out: open the form in place. Elsewhere it is a page load. */
  onLogin?: () => void;
  onRegister?: () => void;
  google?: ReactNode;
}

/** Signed in? Then the header offers the app instead of the forms. */
function useSignedIn(skip: boolean): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (skip) return;
    fetch(`${BASE}/api/auth/user`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: unknown } | null) => setSignedIn(!!d?.user))
      .catch(() => undefined);
  }, [skip]);
  return signedIn;
}

export function useSiteActions(actions: SiteActions) {
  const signedIn = useSignedIn(!!actions.onLogin);
  const go = (start: "login" | "register") => {
    window.location.href = `${BASE}/?start=${start}`;
  };
  return {
    signedIn,
    login: actions.onLogin ?? (() => go("login")),
    register: actions.onRegister ?? (() => go("register")),
    toApp: () => {
      window.location.href = `${BASE}/`;
    },
  };
}

function NavLinks({ onPick }: { onPick?: () => void }) {
  const [location] = useLocation();
  return (
    <>
      {SITE_NAV.map((n) => {
        const active = location === SITE_PATHS[n.page];
        return (
          <Link
            key={n.page}
            href={SITE_PATHS[n.page]}
            onClick={onPick}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground"}`}
            aria-current={active ? "page" : undefined}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

export function SiteLayout({ actions, children }: { actions: SiteActions; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { signedIn, login, register, toApp } = useSiteActions(actions);
  const [location] = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <SceneStyles />
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href={SITE_PATHS.start} className="flex items-center gap-2 font-semibold text-primary">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </span>
            Little Farming
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Hauptmenü">
            <NavLinks />
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Button size="sm" onClick={toApp}>
                Zur App
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={login}>
                  Anmelden
                </Button>
                <Button size="sm" onClick={register}>
                  Kostenlos starten
                </Button>
              </>
            )}
            <button type="button" className="rounded-lg p-2 hover:bg-muted lg:hidden" aria-label={open ? "Menü schließen" : "Menü öffnen"} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t bg-background px-4 py-3 lg:hidden" aria-label="Hauptmenü">
            <div className="flex flex-col gap-1">
              <NavLinks onPick={() => setOpen(false)} />
              {!signedIn && (
                <button type="button" className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted sm:hidden" onClick={login}>
                  Anmelden
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      <main>{children}</main>
      <SiteFeedback />

      <footer className="mt-16 border-t bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <Leaf className="h-5 w-5" />
              Little Farming
            </p>
            <p className="text-sm text-muted-foreground">Pflanzen, Garten und Tiere in einer App – vom Balkon bis zum kleinen Hof.</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold">Entdecken</p>
            {SITE_NAV.map((n) => (
              <Link key={n.page} href={SITE_PATHS[n.page]} className="block text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold">Rechtliches</p>
            <a href={legalHref(LEGAL_PATHS.impressum)} className="block text-muted-foreground hover:text-foreground">Impressum</a>
            <a href={legalHref(LEGAL_PATHS.datenschutz)} className="block text-muted-foreground hover:text-foreground">Datenschutz</a>
            <a href={legalHref(LEGAL_PATHS.nutzungsbedingungen)} className="block text-muted-foreground hover:text-foreground">Nutzungsbedingungen</a>
          </div>
        </div>
        <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground">Screenshots zeigen den Demo-Hof der App.</p>
      </footer>
    </div>
  );
}

/** A page section with a heading. */
export function Section({ id, eyebrow, title, intro, children, className = "" }: { id?: string; eyebrow?: string; title: string; intro?: string; children?: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-24 px-4 py-12 ${className}`}>
      <div className="max-w-2xl space-y-2">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>}
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        {intro && <p className="text-lg text-muted-foreground">{intro}</p>}
      </div>
      {children && <div className="mt-8">{children}</div>}
    </section>
  );
}

/** The big top of a page: the drawn farm behind a headline. */
export function PageHero({ eyebrow, title, text, variant = "day", children }: { eyebrow: string; title: string; text: string; variant?: "day" | "evening" | "green"; children?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden">
      <FarmScene variant={variant} className="absolute inset-0 -z-10 h-full w-full" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/85 via-background/60 to-background/10 dark:from-background/90 dark:via-background/70" />
      <div className="mx-auto max-w-6xl px-4 pb-40 pt-14 sm:pb-56 sm:pt-20">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="text-lg text-foreground/80">{text}</p>
          {children}
        </div>
      </div>
    </section>
  );
}
