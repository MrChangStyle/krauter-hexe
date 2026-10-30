import type { ComponentType } from "react";
import {
  Baby,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Bug,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Crown,
  Contact,
  Egg,
  Fence,
  FileText,
  Flower2,
  Handshake,
  Hexagon,
  Leaf,
  Lightbulb,
  ListTodo,
  NotebookPen,
  Package,
  PawPrint,
  PiggyBank,
  Pill,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
  Sprout,
  Stethoscope,
  SunMoon,
  Trees,
  UserCog,
  Users,
  Wand2,
  Warehouse,
  Wheat,
} from "lucide-react";

/**
 * The look of every module (docs/DESIGN.md): icon, colour, name and short hint.
 * The hub tiles (Pflanzen, Tiere) and the page headers of the modules both take
 * it from here, so a module looks the same on the overview and on its own page.
 */
export type ModuleArea = "hof" | "pflanzen" | "tiere" | "mehr";

export interface ModuleLook {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint: string;
  /** Background and text colour of the icon square. */
  tone: string;
  /** Where the back link leads: the area, or the key of the module a sub page belongs to. */
  parent: ModuleArea | string;
}

const T = {
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  stone: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  lime: "bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300",
  green: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  primary: "bg-primary/10 text-primary",
} as const;

export const TONES = T;

export const MODULE_LOOK = {
  // ── Pflanzen ──
  "meine-pflanzen": { href: "/meine-pflanzen", icon: Sprout, label: "Meine Pflanzen", hint: "Alle gescannten Pflanzen mit Steckbrief", tone: T.green, parent: "pflanzen" },
  aufgaben: { href: "/aufgaben", icon: CalendarCheck, label: "Pflegeplan", hint: "Aufgaben & Erinnerungen", tone: T.sky, parent: "pflanzen" },
  pflanzendoc: { href: "/pflanzendoc", icon: Stethoscope, label: "Pflanzendoc", hint: "Diagnose & Pflege-Guide", tone: T.orange, parent: "pflanzen" },
  "pflege-guides": { href: "/pflege-guides", icon: BookOpen, label: "Pflege-Guides", hint: "Deine Guides aus dem Pflanzendoc", tone: T.orange, parent: "pflanzendoc" },
  schaedlinge: { href: "/schaedlinge", icon: Bug, label: "Schädlinge & Nützlinge", hint: "Bio & chemisch", tone: T.amber, parent: "pflanzen" },
  lexikon: { href: "/lexikon", icon: BookOpen, label: "Lexikon", hint: "Alle Arten · mit Pilzen", tone: T.stone, parent: "pflanzen" },
  kraeuter: { href: "/kraeuter-hexe", icon: Sparkles, label: "Kräuter-Hexe", hint: "Heilkräuter-Ratgeber", tone: T.violet, parent: "pflanzen" },
  beete: { href: "/beete", icon: Fence, label: "Beet-Architekt", hint: "Beete, Standort, Saatgut", tone: T.rose, parent: "pflanzen" },
  "garten-kalender": { href: "/beete/kalender", icon: CalendarDays, label: "Gartenkalender", hint: "Säen, pflanzen, ernten je Monat", tone: T.sky, parent: "beete" },
  "garten-assistent": { href: "/beete/assistent", icon: Wand2, label: "Garten-Assistent", hint: "Wie viel Beet für Küche und Tiere", tone: T.violet, parent: "beete" },
  saatgut: { href: "/beete/saatgut", icon: Sprout, label: "Saatgut", hint: "Vorrat und Keimprobe", tone: T.green, parent: "beete" },
  ernte: { href: "/beete/ernte", icon: BarChart3, label: "Ernte-Auswertung", hint: "Ertrag, Kosten, Stunden", tone: T.emerald, parent: "beete" },
  grow: { href: "/grow", icon: Leaf, label: "Grow", hint: "Eigenanbau ab 18", tone: T.emerald, parent: "pflanzen" },
  "grow-wissen": { href: "/grow/wissen", icon: Lightbulb, label: "Grow-Wissen", hint: "Anbau Schritt für Schritt", tone: T.sky, parent: "grow" },
  "grow-recht": { href: "/grow/recht", icon: Scale, label: "Rechtliches", hint: "KCanG in Kürze", tone: T.stone, parent: "grow" },
  "grow-kcang": { href: "/grow/kcang", icon: ShieldCheck, label: "KCanG-Check", hint: "Pflanzen und Vorrat im Rahmen", tone: T.emerald, parent: "grow" },
  "grow-erinnerungen": { href: "/grow/erinnerungen", icon: BellRing, label: "Erinnerungen", hint: "Gießen, Phasen, Ernte aufs Handy", tone: T.amber, parent: "grow" },
  "grow-premium": { href: "/grow/premium", icon: Crown, label: "Premium", hint: "KI-Check der Pflanzen", tone: T.violet, parent: "grow" },
  vorrat: { href: "/vorrat", icon: Package, label: "Vorratskammer", hint: "Eingekocht, eingefroren, Honig", tone: T.orange, parent: "pflanzen" },
  // ── Tiere ──
  "meine-tiere": { href: "/farm/tiere", icon: PawPrint, label: "Meine Tiere", hint: "Alle Tiere, einzeln oder in Gruppen", tone: T.primary, parent: "tiere" },
  stall: { href: "/farm/stall", icon: Warehouse, label: "Am Stall", hint: "Eier und Aufgaben mit einem Tipp", tone: T.primary, parent: "tiere" },
  "stall-aufgaben": { href: "/farm/aufgaben", icon: ClipboardList, label: "Stall-Aufgaben", hint: "Füttern, Ausmisten, Erinnerungen", tone: T.emerald, parent: "tiere" },
  futter: { href: "/farm/futter", icon: Wheat, label: "Futterplaner", hint: "Rationen, Bedarf, Vorrat", tone: T.yellow, parent: "tiere" },
  "futter-vorrat": { href: "/farm/futter/vorrat", icon: Package, label: "Vorrat & Kosten", hint: "Bestand, Nachkaufen, Wintervorrat", tone: T.amber, parent: "futter" },
  "futter-tipps": { href: "/farm/futter/tipps", icon: Lightbulb, label: "Tipps & Rezepte", hint: "Futterkalender und Rezepte", tone: T.orange, parent: "futter" },
  zucht: { href: "/farm/zucht", icon: Baby, label: "Zucht", hint: "Trächtigkeit, Brut, Jungtiere", tone: T.pink, parent: "tiere" },
  arzneimittel: { href: "/farm/arzneimittel", icon: Pill, label: "Arzneimittel", hint: "Vorrat, Charge, Wartezeit", tone: T.red, parent: "tiere" },
  pflichten: { href: "/farm/pflichten", icon: ShieldCheck, label: "Pflichten & Tierseuchen", hint: "Anmeldung, Kasse, Stallpflicht", tone: T.sky, parent: "tiere" },
  weide: { href: "/farm/weide", icon: Trees, label: "Weide", hint: "Flächen, Umtreiben, Ruhezeit", tone: T.lime, parent: "tiere" },
  bienen: { href: "/farm/bienen", icon: Hexagon, label: "Bienen", hint: "Stockkarte, Varroa, Honig", tone: T.amber, parent: "tiere" },
  ertrag: { href: "/farm/ertrag", icon: PiggyBank, label: "Ertrag & Bilanz", hint: "Eier, Milch, Ernte, Kosten", tone: T.emerald, parent: "tiere" },
  legeleistung: { href: "/farm/legeleistung", icon: Egg, label: "Legeleistung", hint: "Eier je Henne und Woche", tone: T.yellow, parent: "ertrag" },
  kameras: { href: "/farm/kameras", icon: Radar, label: "Wildtier-Radar", hint: "Kameras & Raubtier-Alarm", tone: T.stone, parent: "tiere" },
  uebergabe: { href: "/farm/uebergabe", icon: Handshake, label: "Übergabe", hint: "Vertretung für ein paar Tage", tone: T.orange, parent: "tiere" },
  team: { href: "/team", icon: Users, label: "Farm & Team", hint: "Team, Vertretung, Kontakte", tone: T.violet, parent: "mehr" },
  // Mehr's settings, each on its own page (docs/DESIGN.md, D4).
  benachrichtigungen: { href: "/mehr/benachrichtigungen", icon: Bell, label: "Benachrichtigungen", hint: "Erinnerungen aufs Handy", tone: T.amber, parent: "mehr" },
  darstellung: { href: "/mehr/darstellung", icon: SunMoon, label: "Darstellung", hint: "Hell, dunkel oder wie das Gerät", tone: T.sky, parent: "mehr" },
  konto: { href: "/mehr/konto", icon: UserCog, label: "Konto", hint: "Name, Passwort, Rechtliches", tone: T.stone, parent: "mehr" },
  // Farm & Team's parts, each on its own page (docs/team.md).
  "team-mitglieder": { href: "/team/mitglieder", icon: Users, label: "Team", hint: "Wer mithilft, Rollen, Einladen", tone: T.violet, parent: "team" },
  "team-vertretung": { href: "/team/vertretung", icon: CalendarClock, label: "Vertretung", hint: "Zugang auf Zeit, Tierarzt", tone: T.sky, parent: "team" },
  "team-kontakte": { href: "/team/kontakte", icon: Contact, label: "Kontakte", hint: "Tierarzt, Hufschmied, Nachbarn", tone: T.amber, parent: "team" },
  bewirtschaftung: { href: "/team/bewirtschaftung", icon: Leaf, label: "Bewirtschaftung", hint: "Konventionell, naturnah oder Bio", tone: T.green, parent: "team" },
  nachhaltigkeit: { href: "/team/nachhaltigkeit", icon: Flower2, label: "Nachhaltigkeit", hint: "Maßnahmen und Hof-Steckbrief", tone: T.lime, parent: "team" },
  export: { href: "/farm/export", icon: FileText, label: "Veterinäramt-Export", hint: "Bestandsliste & Medizin als PDF", tone: T.teal, parent: "tiere" },
  // ── Hof ──
  notizen: { href: "/notizen", icon: NotebookPen, label: "Notizen", hint: "Gedanken, Einkauf, Ideen", tone: T.yellow, parent: "hof" },
  "hof-aufgaben": { href: "/hof-aufgaben", icon: ListTodo, label: "Hof-Aufgaben", hint: "Alles, was auf dem Hof ansteht", tone: T.sky, parent: "hof" },
} satisfies Record<string, ModuleLook>;

export type LookKey = keyof typeof MODULE_LOOK;

export const AREA_BACK: Record<ModuleArea, { href: string; label: string }> = {
  hof: { href: "/", label: "Hof" },
  pflanzen: { href: "/pflanzen", label: "Pflanzen" },
  tiere: { href: "/farm", label: "Tiere" },
  mehr: { href: "/mehr", label: "Mehr" },
};

/** Where the back link of a module page leads. */
export function backOf(key: LookKey): { href: string; label: string } {
  const parent = (MODULE_LOOK as Record<string, ModuleLook>)[key]!.parent;
  if (parent in AREA_BACK) return AREA_BACK[parent as ModuleArea];
  const p = (MODULE_LOOK as Record<string, ModuleLook>)[parent]!;
  return { href: p.href, label: p.label };
}

/** What a hub tile needs of a module. */
export function tileOf(key: LookKey): Pick<ModuleLook, "href" | "icon" | "label" | "hint" | "tone"> {
  const { href, icon, label, hint, tone } = MODULE_LOOK[key];
  return { href, icon, label, hint, tone };
}
