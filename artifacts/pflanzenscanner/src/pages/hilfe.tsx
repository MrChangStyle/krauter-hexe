import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, CircleHelp, Search } from "lucide-react";
import type { ModuleId } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useModules } from "@/hooks/use-modules";
import { GENERAL_HELP, MODULE_HELP, searchHelp } from "@/lib/help";
import { MODULES } from "@/lib/modules";

const norm = (s: string) => s.toLocaleLowerCase("de-DE");

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border">
      {items.map((f) => (
        <details key={f.q} className="py-1.5">
          <summary className="cursor-pointer font-medium">{f.q}</summary>
          <p className="pt-1 text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function ModuleHelp({ id }: { id: ModuleId }) {
  const e = MODULE_HELP[id];
  return (
    <details id={id} className="scroll-mt-20 rounded-xl border border-border bg-card p-3 text-sm" data-testid="help-module">
      <summary className="cursor-pointer">
        <span className="font-semibold">{e.title}</span>
        <span className="block text-xs text-muted-foreground">{e.intro}</span>
      </summary>
      <div className="space-y-3 pt-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">So funktioniert’s</p>
          <ol className="list-decimal space-y-1 pl-5 pt-1">
            {e.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Häufige Fragen</p>
          <Faq items={e.faq} />
        </div>
        <Link href={e.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Zu {e.title}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </details>
  );
}

/** /hilfe – Hilfe & FAQ: every module explained (lib/help.ts), and general questions. */
export default function HilfePage() {
  const { visible } = useModules();
  const [query, setQuery] = useState("");
  // Open the module named in the link (/hilfe#bees).
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? (document.getElementById(id) as HTMLDetailsElement | null) : null;
    if (el) {
      el.open = true;
      el.scrollIntoView();
    }
  }, []);

  const shown = MODULES.map((m) => m.id).filter((id) => visible(id));
  const hits = searchHelp(query, shown);
  const q = norm(query.trim());
  const general = q ? GENERAL_HELP.map((t) => ({ ...t, faq: t.faq.filter((f) => norm(`${t.title} ${f.q} ${f.a}`).includes(q)) })).filter((t) => t.faq.length > 0) : GENERAL_HELP;
  const area = (a: "pflanzen" | "tiere") => hits.filter((id) => MODULES.find((m) => m.id === id)?.area === a);

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CircleHelp className="h-6 w-6 text-primary" />
          Hilfe & FAQ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Was jedes Modul kann und wie es geht – dieselben Erklärungen wie oben auf den Seiten, dazu häufige Fragen.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Hilfe durchsuchen" className="pl-9" placeholder="z. B. Ohrmarke, Wartezeit, Push" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {general.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Allgemein</h2>
          {general.map((t) => (
            <div key={t.id} id={t.id} className="scroll-mt-20 rounded-xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold">{t.title}</p>
              <Faq items={t.faq} />
            </div>
          ))}
        </section>
      )}
      {(["pflanzen", "tiere"] as const).map((a) =>
        area(a).length > 0 ? (
          <section key={a} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{a === "pflanzen" ? "Pflanzen" : "Tiere"}</h2>
            {area(a).map((id) => (
              <ModuleHelp key={id} id={id} />
            ))}
          </section>
        ) : null,
      )}
      {q && general.length === 0 && hits.length === 0 && <p className="text-sm text-muted-foreground">Dazu steht nichts in der Hilfe. Schreib uns über die Sprechblase unten rechts – wir ergänzen es.</p>}
      <p className="text-xs text-muted-foreground">Ausgeblendete Module stehen hier nicht. Einblenden unter „Mehr → Meine Module“.</p>
    </div>
  );
}
