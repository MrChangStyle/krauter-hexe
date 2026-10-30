import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bug,
  Camera,
  ChevronDown,
  CalendarCheck,
  Check,
  ClipboardList,
  CloudSun,
  Crown,
  Egg,
  FileText,
  Flower2,
  FlaskConical,
  Hexagon,
  HeartPulse,
  Leaf,
  LayoutGrid,
  ListChecks,
  Recycle,
  type LucideIcon,
  Map as MapIcon,
  MessageCircle,
  PawPrint,
  Pill,
  Radar,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sprout,
  Stethoscope,
  Users,
  WandSparkles,
  Warehouse,
  WifiOff,
  Wheat,
} from "lucide-react";
import type { ModuleId } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PageHero, PhoneShot, PlanBadge, Section, SitePhoto, useSiteActions, type SiteActions } from "@/components/site/site-parts";
import { openSiteFeedback } from "@/components/site/site-feedback";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { LANDING_TEXT } from "@/lib/landing";
import { MODULES, type ModuleArea } from "@/lib/modules";
import { SITE_FAQ } from "@/lib/site-meta";
import {
  FINDER_AI_LABELS,
  FINDER_ANIMALS,
  FINDER_ANIMAL_LABELS,
  FINDER_PLANTS,
  FINDER_PLANT_LABELS,
  MODULE_SITE,
  SITE_SPECIES,
  SPECIES_WISH_TEXT,
  PLANS,
  PRICES_PROVISIONAL,
  TEST_PHASE,
  SITE_PATHS,
  moduleLabel,
  planById,
  priceText,
  recommend,
  saveFinderChoice,
  yearlySaving,
  type FinderAi,
  type FinderInput,
} from "@/lib/site";

const ICONS: Partial<Record<ModuleId, LucideIcon>> = {
  "my-plants": Leaf,
  "care-plan": CalendarCheck,
  "plant-doc": Stethoscope,
  pests: Bug,
  lexicon: BookOpen,
  "herb-witch": FlaskConical,
  garden: Sprout,
  pantry: Warehouse,
  grow: WandSparkles,
  "farm-tasks": ListChecks,
  feed: Wheat,
  breeding: HeartPulse,
  medicines: Pill,
  duties: ShieldCheck,
  yields: Egg,
  pasture: MapIcon,
  bees: Hexagon,
  wildlife: Radar,
  handover: ClipboardList,
  members: Users,
  export: FileText,
};

/** Drawn pictures beside some modules (components/site/scenes.tsx). */
const MODULE_PHOTO: Partial<Record<ModuleId, { slot: string; alt: string }>> = {
  "my-plants": { slot: "plants", alt: "Zimmerpflanzen am Fenster, ein Handy scannt ein Blatt" },
  "care-plan": { slot: "plants", alt: "Zimmerpflanzen am Fenster" },
  "plant-doc": { slot: "herbs", alt: "Kräuter und Mörser" },
  lexicon: { slot: "herbs", alt: "Kräuter und Mörser" },
  grow: { slot: "plants", alt: "Pflanzen am Fenster" },
  medicines: { slot: "goats", alt: "Ziegen an der Heuraufe" },
  duties: { slot: "animals", alt: "Hühner am Stall" },
  yields: { slot: "pricing", alt: "Erntekorb mit Eiern, Gemüse und Honig" },
  handover: { slot: "team", alt: "Familie auf dem Hof" },
  export: { slot: "pasture", alt: "Schafe auf der Weide" },
  garden: { slot: "garden", alt: "Hochbeet mit Tomaten, Salat und Möhren" },
  "herb-witch": { slot: "herbs", alt: "Frisch gepflückte Heil- und Küchenkräuter auf einem Holztisch" },
  pantry: { slot: "pantry", alt: "Regal mit eingekochtem Gemüse, Marmelade und Honig" },
  "farm-tasks": { slot: "animals", alt: "Hühner auf der Wiese vor dem Hühnerstall" },
  feed: { slot: "goats", alt: "Ziegen an der Heuraufe" },
  pasture: { slot: "pasture", alt: "Schafe auf einer eingezäunten Weide" },
  bees: { slot: "bees", alt: "Bienenstöcke am Rand einer blühenden Obstwiese" },
  members: { slot: "team", alt: "Eine Familie arbeitet gemeinsam auf dem Hof" },
  pests: { slot: "pests", alt: "Marienkäfer auf einem Blatt unter der Lupe" },
  breeding: { slot: "chicks", alt: "Glucke mit Küken" },
  wildlife: { slot: "wildlife", alt: "Fuchs nachts am Hühnerzaun, die Kamera meldet ihn" },
};

function Cta({ actions, finder = true }: { actions: SiteActions; finder?: boolean }) {
  const { signedIn, register, toApp } = useSiteActions(actions);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button size="lg" className="gap-2" onClick={signedIn ? toApp : register}>
        {signedIn ? "Zur App" : "Kostenlos starten"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {finder && (
        <Button size="lg" variant="outline" asChild>
          <Link href={SITE_PATHS.finder}>Welche Module passen zu mir?</Link>
        </Button>
      )}
    </div>
  );
}

/** An app screenshot in front of a drawn scene (or the farm with an icon). */
function ScreenOnScene({ screen, slot, alt, label, icon }: { screen: string; slot: string; alt: string; label: string; icon: LucideIcon }) {
  return (
    <div className="relative mx-auto flex max-w-md justify-center py-8">
      <SitePhoto slot={slot} alt={alt} icon={icon} className="absolute inset-x-0 bottom-16 top-16" />
      <PhoneShot screen={screen} alt={`So sieht ${label} in der App aus`} className="relative" />
    </div>
  );
}

/** One module: text on one side, the app on the other – alternating. */
function ModuleBlock({ id, index }: { id: ModuleId; index: number }) {
  const site = MODULE_SITE[id]!;
  const Icon = ICONS[id] ?? Leaf;
  return (
    <article id={id} className="grid scroll-mt-28 items-center gap-8 py-10 md:grid-cols-2" data-testid={`site-module-${id}`}>
      <div className={`space-y-4 ${index % 2 ? "md:order-2" : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <h3 className="text-2xl font-bold">{moduleLabel(id)}</h3>
          {site.ai && <PlanBadge plan={site.ai.plan} />}
        </div>
        <p className="text-lg text-muted-foreground">{LANDING_TEXT[id]}</p>
        <ul className="space-y-2">
          {site.points.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>{p}</span>
            </li>
          ))}
          {site.ai && (
            <li className="flex gap-2">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <span>
                <span className="font-medium">Mit KI:</span> {site.ai.text}
              </span>
            </li>
          )}
        </ul>
      </div>
      <div className={index % 2 ? "md:order-1" : ""}>
        <ScreenOnScene screen={site.screen} slot={MODULE_PHOTO[id]?.slot ?? `module-${id}`} alt={MODULE_PHOTO[id]?.alt ?? moduleLabel(id)} label={moduleLabel(id)} icon={Icon} />
      </div>
    </article>
  );
}

/** Tiere page: the species the app knows, the newest one drawn, and a way to ask for more. */
function SpeciesSection() {
  return (
    <Section id="tierarten" eyebrow="Tierarten" title="Diese Tiere kennt die App" intro="Für jede Art eigene Regeln: Futterbedarf, Trächtigkeit oder Brut, Weide, Pflichten gegenüber den Ämtern und Wartezeiten.">
      <div className="grid items-start gap-8 md:grid-cols-2">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="site-species">
          {SITE_SPECIES.map((s) => (
            <li key={s.key} className={`flex items-center gap-2 rounded-2xl border bg-card px-3 py-2.5 text-sm font-medium ${s.isNew ? "border-primary" : ""}`}>
              <span className="text-2xl leading-none" aria-hidden="true">
                {s.emoji}
              </span>
              <span className="min-w-0">
                {s.label}
                {s.isNew && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">Neu</span>}
              </span>
            </li>
          ))}
        </ul>
        <figure className="space-y-2">
          <SitePhoto slot="alpacas" alt="Alpakas auf der Weide" className="aspect-[4/3] w-full" />
          <figcaption className="text-sm text-muted-foreground">Neu dabei: Alpakas – mit Futterplan, Zucht samt Spucktest, Schur-Erinnerung und Pflichten.</figcaption>
        </figure>
      </div>
      <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <MessageCircle className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Deine Tierart fehlt?</p>
            <p className="text-sm text-muted-foreground">Sag uns Bescheid – wir ergänzen Tierarten auf Wunsch, mit Futter, Zucht und Pflichten. Enten, Wachteln oder Esel stecken schon unter Geflügel bzw. Pferden.</p>
          </div>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => openSiteFeedback(SPECIES_WISH_TEXT)}>
          <MessageCircle className="h-4 w-4" />
          Tierart wünschen
        </Button>
      </div>
    </Section>
  );
}

export function AreaPage({ area, actions }: { area: ModuleArea; actions: SiteActions }) {
  const modules = MODULES.filter((m) => m.area === area && !m.isArea && (m.id !== "grow" || GROW_ENABLED));
  const plants = area === "pflanzen";
  return (
    <>
      <PageHero
        eyebrow={plants ? "Pflanzen & Garten" : "Tiere & Hof"}
        title={plants ? "Vom Fensterbrett bis zum Gemüsebeet" : "Gut versorgt – vom Hühnerstall bis zur Weide"}
        text={
          plants
            ? "Pflanzen erkennen, pflegen und vermehren, Beete planen, ernten und einlagern. Die App erinnert dich zur richtigen Zeit – und warnt bei Frost."
            : "Für Hühner, Ziegen, Schafe, Alpakas, Kaninchen, Rinder, Pferde und Bienen: Aufgaben im Stall, Futter, Zucht, Arzneimittel und die Pflichten gegenüber den Ämtern."
        }
        variant={plants ? "green" : "day"}
      >
        <Cta actions={actions} />
      </PageHero>

      <nav className="sticky top-16 z-20 border-b bg-background/95 backdrop-blur" aria-label={plants ? "Module Pflanzen" : "Module Tiere"}>
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2">
          {modules.map((m) => (
            <a key={m.id} href={`#${m.id}`} className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary hover:text-primary">
              {m.label}
            </a>
          ))}
        </div>
      </nav>

      {!plants && <SpeciesSection />}

      <div className="mx-auto max-w-6xl divide-y px-4">
        {modules.map((m, i) => (
          <ModuleBlock key={m.id} id={m.id} index={i} />
        ))}
      </div>

      <Section title="Nur, was du brauchst" intro="Jedes Modul lässt sich ein- und ausblenden. Der Modul-Finder schlägt dir vor, was zu deinem Garten und deinen Tieren passt.">
        <Cta actions={actions} />
      </Section>
    </>
  );
}

// ── Start ────────────────────────────────────────────────────────────────────

const HIGHLIGHTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Camera, title: "Scannen statt suchen", text: "Foto machen – die App erkennt Pflanzen, Pilze und Insekten." },
  { icon: Bell, title: "Nichts vergessen", text: "Erinnerungen für Pflanzen und Stall, für dich und dein Team." },
  { icon: LayoutGrid, title: "Deine App, deine Module", text: "Nur einblenden, was du brauchst. Alles andere bleibt aufgeräumt." },
  { icon: Smartphone, title: "Läuft auf dem Handy", text: "Als App auf dem Startbildschirm – Fotos warten auch ohne Empfang." },
];

function AreaTeaser({ title, text, href, slot, alt, icon, modules }: { title: string; text: string; href: string; slot: string; alt: string; icon: LucideIcon; modules: string[] }) {
  return (
    <Link href={href} className="group block overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <SitePhoto slot={slot} alt={alt} icon={icon} className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-2 p-5">
        <h3 className="flex items-center justify-between text-xl font-bold">
          {title}
          <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
        </h3>
        <p className="text-muted-foreground">{text}</p>
        <p className="text-sm text-foreground/70">{modules.join(" · ")}</p>
      </div>
    </Link>
  );
}

export function StartPage({ actions }: { actions: SiteActions }) {
  const label = (area: ModuleArea) => MODULES.filter((m) => m.area === area && !m.isArea && (m.id !== "grow" || GROW_ENABLED)).map((m) => m.label);
  return (
    <>
      <PageHero
        eyebrow="Little Farming"
        title="Dein Hof in einer App"
        text="Pflanzen, Garten und Tiere an einem Ort: erkennen, planen, versorgen und an alles erinnert werden – vom Balkon bis zum kleinen Hof."
      >
        <Cta actions={actions} />
        {actions.google}
      </PageHero>

      <div className="mx-auto -mt-24 max-w-6xl px-4 sm:-mt-32">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-3xl border bg-card/95 p-5 shadow-sm backdrop-blur">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>

      <Section eyebrow="Entdecken" title="Was steckt drin?" intro="Zwei Bereiche, viele Module – und ein Hof, der alles zusammenbringt.">
        <div className="grid gap-6 md:grid-cols-3">
          <AreaTeaser title="Pflanzen & Garten" text="Scannen, pflegen, Beete planen, ernten und einlagern." href={SITE_PATHS.plants} slot="garden" alt="Hochbeet mit Gemüse" icon={Sprout} modules={label("pflanzen").slice(0, 5)} />
          <AreaTeaser title="Tiere & Hof" text="Stall, Futter, Zucht, Arzneimittel, Pflichten, Weide und Bienen." href={SITE_PATHS.animals} slot="animals" alt="Hühner auf der Wiese" icon={PawPrint} modules={label("tiere").slice(0, 5)} />
          <AreaTeaser title="Gemeinsam auf dem Hof" text="Team, Rollen, Urlaubsvertretung und Erinnerungen für alle." href={SITE_PATHS.farm} slot="team" alt="Familie auf dem Hof" icon={Users} modules={["Hof-Startseite", "Team & Rollen", "Übergabe", "Wetterwarnungen"]} />
        </div>
      </Section>

      <Section eyebrow="Auf einen Blick" title="Der Hof auf der Startseite" intro="Wetter für deinen Standort, fällige Aufgaben, Tiere, Vorräte und Warnungen vom Deutschen Wetterdienst – du legst selbst fest, was dort steht.">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <ul className="space-y-3">
            {[
              [CloudSun, "Frost, Hitze und Sturm mit Tipps für Tiere und Beete"],
              [ListChecks, "Was heute im Stall und im Garten zu tun ist"],
              [Bell, "Push-Erinnerungen fürs ganze Team"],
              [WifiOff, "Funktioniert auch mit schlechtem Empfang"],
            ].map(([Icon, text]) => {
              const I = Icon as LucideIcon;
              return (
                <li key={text as string} className="flex gap-3 text-lg">
                  <I className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  {text as string}
                </li>
              );
            })}
          </ul>
          <PhoneShot screen="hof" alt="Die Hof-Startseite der App mit Wetter und Aufgaben" />
        </div>
      </Section>

      {/* Bio & nachhaltig (docs/bio.md, B8): an option, never a must. */}
      <Section
        id="bio"
        eyebrow="Bio & nachhaltig"
        title="Bio, wenn du willst – nachhaltig für alle"
        intro="Little Farming ist keine reine Bio-App: Jeder Hof stellt ein, ob er konventionell, naturnah oder Bio wirtschaftet, und kann jederzeit wechseln. Wer Bio wählt, bekommt die passenden Prüfungen dazu."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="site-bio">
          {[
            [Leaf, "Bio-Check", "Eine Ampel für Futter, Platz, Behandlungen, Saatgut und Dünger – ein Tipp zeigt, was fehlt."],
            [Recycle, "Kreislauf Stall → Beet", "Wie viel Mist deine Tiere geben und für wie viel Beet er reicht. Düngung je Beet eintragen."],
            [FileText, "Bio-Dokumentation", "Ein PDF für die Öko-Kontrolle: Bestand, Behandlungen mit Bio-Wartezeit, Futter, Auslauf, Weide, Saatgut, Düngung."],
            [Flower2, "Nachhaltig auf jedem Hof", "Nistkästen, Blühstreifen, Hecken, Regenwasser, Kompost abhaken – daraus wird ein Hof-Steckbrief."],
          ].map(([Icon, title, text]) => {
            const I = Icon as LucideIcon;
            return (
              <li key={title as string} className="rounded-3xl border bg-card p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <I className="h-6 w-6" />
                </span>
                <p className="mt-3 font-semibold">{title as string}</p>
                <p className="mt-1 text-sm text-muted-foreground">{text as string}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section eyebrow="Pakete" title="Kostenlos starten, KI dazu, wenn du magst" intro="Alles ohne KI ist kostenlos. Für Foto-Checks und KI-Vorschläge gibt es Lite und Premium.">
        <PlanCards compact />
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link href={SITE_PATHS.pricing}>Alle Pakete vergleichen</Link>
          </Button>
        </div>
      </Section>

      <Section id="fragen" eyebrow="Fragen" title="Häufige Fragen">
        <div className="grid gap-3 md:grid-cols-2" data-testid="site-faq">
          {SITE_FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-3xl border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold">
                {q}
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section eyebrow="Los geht's" title="In drei Schritten startklar">
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ["Konto anlegen", "Kostenlos und in einer Minute erledigt."],
            ["Module wählen", "Der Modul-Finder oder der Einrichtungsassistent fragt, was du brauchst."],
            ["Ausprobieren", "Mit Demo-Daten siehst du sofort, wie alles aussieht."],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-3xl border bg-card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Cta actions={actions} />
        </div>
      </Section>
    </>
  );
}

// ── Gemeinsam auf dem Hof ────────────────────────────────────────────────────

export function FarmPage({ actions }: { actions: SiteActions }) {
  const blocks: { icon: LucideIcon; title: string; text: string; points: string[]; visual: ReactNode }[] = [
    {
      icon: LayoutGrid,
      title: "Die Hof-Startseite",
      text: "Alles Wichtige aus allen Modulen auf einen Blick – Wetter, Aufgaben, Tiere, Vorräte.",
      points: ["Kacheln nach deinem Geschmack anordnen", "Warnungen des Deutschen Wetterdienstes", "Frost- und Hitze-Tipps für Tiere und Beete"],
      visual: <ScreenOnScene screen="hof" slot="animals" alt="Hühner am Stall" label="die Hof-Startseite" icon={LayoutGrid} />,
    },
    {
      icon: Users,
      title: "Team und Rollen",
      text: "Lade Familie, Mitarbeiter oder Nachbarn ein. Jede Person bekommt eine Rolle und auf Wunsch nur bestimmte Module.",
      points: ["Admin, Mitarbeiter oder Gast", "Freigaben je Modul", "Erinnerungen gehen an alle, die mit anpacken"],
      visual: <ScreenOnScene screen="team" slot="team" alt="Familie auf dem Hof" label="Farm & Team" icon={Users} />,
    },
    {
      icon: ClipboardList,
      title: "Urlaubsvertretung",
      text: "Die Vertretung bekommt für ein paar Tage Zugang und sieht genau, was heute zu tun ist – mit Übergabe-Notiz und Notfallnummern.",
      points: ["Zugang endet von selbst", "Was heute fällig ist, auf einer Seite", "Tierarzt und Kontakte immer erreichbar"],
      visual: <ScreenOnScene screen="uebergabe" slot="goats" alt="Ziegen an der Heuraufe" label="die Übergabe" icon={ClipboardList} />,
    },
    {
      icon: BookOpen,
      title: "Hilfe in jedem Modul",
      text: "Jedes Modul erklärt sich oben selbst – und unter „Hilfe & FAQ“ steht alles zum Nachlesen.",
      points: ["Kurze Einführung je Modul", "Häufige Fragen mit Antworten", "Demo-Hof zum Ausprobieren"],
      visual: <ScreenOnScene screen="hilfe" slot="pricing" alt="Erntekorb mit Eiern, Gemüse und Honig" label="Hilfe & FAQ" icon={BookOpen} />,
    },
  ];
  return (
    <>
      <PageHero eyebrow="Gemeinsam auf dem Hof" title="Damit alle wissen, was zu tun ist" text="Ein Hof ist Teamarbeit. Little Farming bringt alle zusammen – mit klaren Rollen, Erinnerungen und einer Übergabe für die Urlaubszeit." variant="evening">
        <Cta actions={actions} />
      </PageHero>
      <div className="mx-auto max-w-6xl divide-y px-4">
        {blocks.map((b, i) => (
          <article key={b.title} className="grid items-center gap-8 py-10 md:grid-cols-2">
            <div className={`space-y-4 ${i % 2 ? "md:order-2" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <b.icon className="h-6 w-6" />
                </span>
                <h3 className="text-2xl font-bold">{b.title}</h3>
              </div>
              <p className="text-lg text-muted-foreground">{b.text}</p>
              <ul className="space-y-2">
                {b.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={i % 2 ? "md:order-1" : ""}>{b.visual}</div>
          </article>
        ))}
      </div>
    </>
  );
}

// ── Preise ───────────────────────────────────────────────────────────────────

export function PlanCards({ yearly = false, compact = false, highlight }: { yearly?: boolean; compact?: boolean; highlight?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const marked = highlight ? p.id === highlight : p.id === "lite";
        const price = yearly ? p.yearly : p.monthly;
        return (
          <div key={p.id} className={`relative flex flex-col rounded-3xl border bg-card p-6 shadow-sm ${marked ? "border-primary ring-2 ring-primary/30" : ""}`} data-testid={`plan-${p.id}`}>
            {marked && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">{highlight ? "Passt zu dir" : "Beliebt"}</span>}
            <p className="flex items-center gap-2 text-lg font-bold">
              {p.id === "premium" ? <Crown className="h-5 w-5 text-amber-500" /> : p.id === "lite" ? <Sparkles className="h-5 w-5 text-sky-500" /> : <Leaf className="h-5 w-5 text-primary" />}
              {p.name}
            </p>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <p className="mt-4 text-3xl font-bold">
              {priceText(price)}
              {price > 0 && <span className="text-base font-normal text-muted-foreground"> / {yearly ? "Jahr" : "Monat"}</span>}
            </p>
            {yearly && p.monthly > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400">{yearlySaving(p)} % günstiger als monatlich</p>}
            {!compact && (
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            {compact && <p className="mt-3 text-sm">{p.features[p.features.length - 2]}</p>}
          </div>
        );
      })}
    </div>
  );
}

const COMPARE: { label: string; plans: [boolean | string, boolean | string, boolean | string] }[] = [
  { label: "Alle Module ohne KI", plans: [true, true, true] },
  { label: "Push-Erinnerungen, Team und Vertretung", plans: [true, true, true] },
  { label: "KI-Anfragen am Tag", plans: [String(PLANS[0]!.aiPerDay), String(PLANS[1]!.aiPerDay), String(PLANS[2]!.aiPerDay)] },
  { label: "Pflanzen- und Insekten-Scan, Pflanzendoc", plans: ["zum Testen", true, true] },
  { label: "Beet-KI (Foto, Vorschlag, Anbaudaten)", plans: [false, true, true] },
  { label: "Hof-KI (Tierart, Haltungs-Wiki, Futter-Etikett)", plans: [false, false, true] },
  { label: "Bienen-Standort-Check, Wildtier-Radar-KI", plans: [false, false, true] },
  { label: "Grow-KI-Check (ab 18)", plans: [false, false, true] },
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="font-medium">{value}</span>;
  return value ? <Check className="mx-auto h-5 w-5 text-primary" aria-label="ja" /> : <span className="text-muted-foreground" aria-label="nein">–</span>;
}

export function PricingPage({ actions }: { actions: SiteActions }) {
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <PageHero eyebrow="Preise & Pakete" title="Kostenlos starten. KI, wenn du sie brauchst." text="Alles, was ohne KI läuft, bleibt kostenlos. KI kostet uns bei jeder Anfrage Geld – deshalb gibt es sie in zwei Paketen." variant="evening">
        <Cta actions={actions} />
      </PageHero>
      <Section title="Die Pakete" intro={TEST_PHASE ? "Vorläufige Preise – bezahlen lässt sich noch nicht. In der Testphase ist alles offen und kostenlos, und wer jetzt testet, zahlt auch nach dem Start nichts." : PRICES_PROVISIONAL ? "Vorläufige Preise – bezahlen lässt sich noch nicht. Bis dahin nutzt du alles wie bisher." : undefined}>
        <div className="mb-6 inline-flex rounded-xl border bg-muted/40 p-1" role="tablist" aria-label="Abrechnung">
          {[false, true].map((y) => (
            <button key={String(y)} type="button" role="tab" aria-selected={yearly === y} className={`rounded-lg px-4 py-1.5 text-sm ${yearly === y ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => setYearly(y)}>
              {y ? "Jährlich" : "Monatlich"}
            </button>
          ))}
        </div>
        <PlanCards yearly={yearly} />
      </Section>
      <Section title="Im Vergleich">
        <div className="overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-semibold">Funktion</th>
                {PLANS.map((p) => (
                  <th key={p.id} className="p-3 text-center font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {COMPARE.map((row) => (
                <tr key={row.label}>
                  <td className="p-3">{row.label}</td>
                  {row.plans.map((v, i) => (
                    <td key={i} className="p-3 text-center">
                      <Cell value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Häufige Fragen">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ...(TEST_PHASE ? [["Ich teste gerade – muss ich später zahlen?", "Nein. In der Testphase ist alles offen und kostenlos. Wer jetzt ein Konto hat und testet, behält die App auch nach dem Start kostenlos – als Dankeschön."]] : []),
            ["Was ist eine KI-Anfrage?", "Jedes Foto, das die KI auswertet, und jeder KI-Vorschlag – z. B. ein Pflanzen-Scan oder ein Beet-Vorschlag. Alles andere zählt nicht."],
            ["Brauche ich für Tiere ein Paket?", "Nein. Stall-Aufgaben, Futterplaner, Zucht, Arzneimittel, Pflichten, Weide und Bienen sind ohne KI kostenlos."],
            ["Kann ich wechseln oder kündigen?", "Ja, jederzeit zum Ende des Zeitraums. Deine Daten bleiben, nur die KI-Funktionen richten sich nach dem Paket."],
            ["Ab wann kann ich bezahlen?", "Sobald die Bezahlung eingerichtet ist. Die Preise hier sind ein Vorschlag und können sich bis dahin ändern."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-3xl border bg-card p-5">
              <p className="font-semibold">{q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Button size="lg" variant="outline" asChild>
            <Link href={SITE_PATHS.finder}>Welches Paket passt zu mir?</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

// ── Modul-Finder ─────────────────────────────────────────────────────────────

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary"}`}
    >
      {on && <Check className="-ml-1 mr-1 inline h-4 w-4" />}
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FinderPage({ actions }: { actions: SiteActions }) {
  const [input, setInput] = useState<FinderInput>({ plants: [], animals: [], pasture: false, team: false, sells: false, ai: "sometimes" });
  const result = useMemo(() => recommend(input), [input]);
  const { signedIn, register, toApp } = useSiteActions(actions);
  const chosen = input.plants.length + input.animals.length > 0 || input.team;
  const plan = planById(result.plan);
  const plantPlants = FINDER_PLANTS.filter((p) => p !== "grow" || GROW_ENABLED);

  return (
    <>
      <PageHero eyebrow="Modul-Finder" title="Was hast du – und was brauchst du?" text="Wähle aus, was bei dir wächst und lebt. Wir schlagen dir die passenden Module und das Paket vor. Wer Hühner und einen Hobbygarten hat, braucht keine Bienen-Stockkarte." variant="green" />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <fieldset className="space-y-3">
            <legend className="text-xl font-bold">Pflanzen</legend>
            <div className="flex flex-wrap gap-2">
              {plantPlants.map((p) => (
                <Chip key={p} on={input.plants.includes(p)} onClick={() => setInput({ ...input, plants: toggle(input.plants, p) })}>
                  {FINDER_PLANT_LABELS[p]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-xl font-bold">Tiere</legend>
            <div className="flex flex-wrap gap-2">
              {FINDER_ANIMALS.map((a) => (
                <Chip key={a} on={input.animals.includes(a)} onClick={() => setInput({ ...input, animals: toggle(input.animals, a) })}>
                  {FINDER_ANIMAL_LABELS[a]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-xl font-bold">Außerdem</legend>
            <div className="flex flex-wrap gap-2">
              <Chip on={input.pasture} onClick={() => setInput({ ...input, pasture: !input.pasture })}>
                Eigene Weiden oder Wiesen
              </Chip>
              <Chip on={input.team} onClick={() => setInput({ ...input, team: !input.team })}>
                Familie oder Helfer packen mit an
              </Chip>
              <Chip on={input.sells} onClick={() => setInput({ ...input, sells: !input.sells })}>
                Ich zähle Ertrag oder verkaufe
              </Chip>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-xl font-bold">KI nutzen?</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FINDER_AI_LABELS) as FinderAi[]).map((a) => (
                <Chip key={a} on={input.ai === a} onClick={() => setInput({ ...input, ai: a })}>
                  {FINDER_AI_LABELS[a]}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-live="polite" data-testid="finder-result">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Unsere Empfehlung</p>
            {!chosen ? (
              <p className="mt-2 text-muted-foreground">Wähle links aus, was du hast – die Empfehlung erscheint hier.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {result.modules.map((m) => (
                    <li key={m.id} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium">{moduleLabel(m.id)}</span>
                        <span className="text-muted-foreground"> – {m.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-2xl bg-primary/5 p-4">
                  <p className="font-semibold">
                    Paket: {plan.name} · {priceText(plan.monthly)}
                    {plan.monthly > 0 && " / Monat"}
                  </p>
                  <p className="text-sm text-muted-foreground">{result.planWhy}</p>
                </div>
                <Button
                  className="mt-4 w-full gap-2"
                  onClick={() => {
                    saveFinderChoice(result.modules.map((m) => m.id));
                    if (signedIn) toApp();
                    else register();
                  }}
                >
                  {signedIn ? "Zur App" : "Mit dieser Auswahl starten"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">Die Auswahl übernimmt der Einrichtungsassistent nach der Anmeldung. Du kannst sie jederzeit ändern.</p>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
