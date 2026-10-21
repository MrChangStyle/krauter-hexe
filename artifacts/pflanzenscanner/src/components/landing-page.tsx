import type { ReactNode } from "react";
import { Bell, Camera, LayoutGrid, Leaf, PawPrint, Smartphone, Sparkles, Sprout, Tractor, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { LANDING_TEXT } from "@/lib/landing";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";
import { MODULES, type ModuleArea } from "@/lib/modules";

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-4 px-4 py-10">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {intro && <p className="text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function ModuleList({ area }: { area: ModuleArea }) {
  const modules = MODULES.filter((m) => m.area === area && !m.isArea && (m.id !== "grow" || GROW_ENABLED));
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {modules.map((m) => (
        <li key={m.id} className="rounded-2xl border bg-card p-4">
          <p className="font-semibold">
            {m.label}
            {m.tier === "lite" && <span className="ml-1.5 rounded-full border border-primary/40 px-1.5 py-px align-middle text-[10px] font-medium text-primary">Lite</span>}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{LANDING_TEXT[m.id]}</p>
        </li>
      ))}
    </ul>
  );
}

const HIGHLIGHTS = [
  { icon: Camera, title: "Scannen statt suchen", text: "Foto machen – die App erkennt Pflanzen, Pilze und Insekten." },
  { icon: Bell, title: "Nichts vergessen", text: "Erinnerungen für Pflanzen und Stall, für dich und dein Team." },
  { icon: LayoutGrid, title: "Deine App, deine Module", text: "Blende aus, was du nicht brauchst. Alles andere bleibt aufgeräumt." },
  { icon: Smartphone, title: "Läuft auf dem Handy", text: "Als App auf dem Startbildschirm, Fotos warten auch ohne Empfang." },
];

const STEPS = [
  { title: "Konto anlegen", text: "Kostenlos und in einer Minute erledigt." },
  { title: "Module wählen", text: "Der Einrichtungsassistent fragt, was du brauchst – Pflanzen, Tiere oder beides." },
  { title: "Ausprobieren", text: "Mit Demo-Daten siehst du sofort, wie alles aussieht. Löschen geht mit einem Klick." },
];

/** The public start page (docs/landingpage.md): what Little Farming is and does, before signing in. */
export function LandingPage({ onLogin, onRegister, google }: { onLogin: () => void; onRegister: () => void; google?: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <span className="flex items-center gap-1.5 font-semibold text-primary">
            <Leaf className="h-5 w-5" />
            Little Farming
          </span>
          <Button size="sm" variant="outline" onClick={onLogin}>
            Anmelden
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <section className="space-y-5 px-4 pb-10 pt-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Sprout className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dein Hof in einer App</h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Pflanzen, Garten und Tiere an einem Ort: erkennen, planen, pflegen und an alles erinnert werden – vom Balkon bis zum kleinen Hof.
          </p>
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" onClick={onRegister}>
              Kostenlos registrieren
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={onLogin}>
              Ich habe schon ein Konto
            </Button>
          </div>
          {google}
          <a href="#module" className="inline-block text-sm text-muted-foreground underline underline-offset-4">
            Erst die Module ansehen
          </a>
        </section>

        <ul className="grid gap-3 px-4 sm:grid-cols-2">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-2xl border bg-card p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <Section id="module" title="Der Hof auf einen Blick" intro="Die Startseite zeigt das Wetter für deinen Standort und das Wichtigste aus allen Modulen: fällige Aufgaben, Tiere, Vorräte. Du legst selbst fest, was dort steht.">
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <Tractor className="h-6 w-6 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">Wetterwarnungen bei Frost, Hitze und Sturm – mit Tipps für Tiere und Beete.</p>
          </div>
        </Section>

        <Section title="Pflanzen" intro="Alles rund um Zimmerpflanzen, Garten und Kräuter.">
          <ModuleList area="pflanzen" />
        </Section>

        <Section title="Tiere" intro="Für Hühner, Ziegen, Schafe, Kaninchen und mehr – vom Hobby bis zum kleinen Betrieb.">
          <ModuleList area="tiere" />
        </Section>

        <Section title="Gemeinsam auf dem Hof" intro="Lade Familie, Mitarbeiter oder die Urlaubsvertretung ein. Jede Person bekommt eine Rolle: Admin, Mitarbeiter oder Gast.">
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <Users className="h-6 w-6 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">Erinnerungen gehen an alle, die mit anpacken. Die Vertretung sieht genau, was heute zu tun ist – und ihr Zugang endet von selbst.</p>
          </div>
        </Section>

        <Section title="Kostenlos, Lite und Premium" intro="Die Grundfunktionen aller Module sind kostenlos.">
          <ul className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-2xl border bg-card p-4">
              <p className="font-semibold">Ohne Kennzeichnung</p>
              <p className="mt-1 text-sm text-muted-foreground">Gehört fest zur App und ist kostenlos.</p>
            </li>
            <li className="rounded-2xl border bg-card p-4">
              <p className="font-semibold">Lite</p>
              <p className="mt-1 text-sm text-muted-foreground">Kostenlos nutzbar – Premium bringt bei diesem Modul noch mehr.</p>
            </li>
            <li className="rounded-2xl border bg-card p-4">
              <p className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Premium
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Zusätzliche KI-Funktionen. Kommt später, Preise stehen noch nicht fest.</p>
            </li>
          </ul>
        </Section>

        <Section title="So legst du los">
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border bg-card p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col items-center gap-2 pt-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="w-full sm:w-auto" onClick={onRegister}>
              Kostenlos registrieren
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={onLogin}>
              Anmelden
            </Button>
          </div>
        </Section>
      </main>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <PawPrint className="h-3.5 w-3.5" />
          Little Farming – mit der Kräuterhexe
        </p>
        <p className="mt-2 flex justify-center gap-4">
          <a href={legalHref(LEGAL_PATHS.impressum)} className="underline underline-offset-4">Impressum</a>
          <a href={legalHref(LEGAL_PATHS.datenschutz)} className="underline underline-offset-4">Datenschutz</a>
          <a href={legalHref(LEGAL_PATHS.nutzungsbedingungen)} className="underline underline-offset-4">Nutzungsbedingungen</a>
        </p>
      </footer>
    </div>
  );
}
