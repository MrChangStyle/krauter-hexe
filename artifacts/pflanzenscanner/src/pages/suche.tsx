import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, LayoutGrid, Loader2, Search, X } from "lucide-react";
import { getSearchQueryKey, useListMyFarms, useSearch, type SearchGroup } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useModules } from "@/hooks/use-modules";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { matchPages } from "@/lib/search-pages";

function Row({ href, title, subtitle }: { href: string; title: string; subtitle?: string | null }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/** /suche – one box for pages, the plant and insect archive and the active farm (docs/suche.md). */
export default function SuchePage() {
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [query, setQuery] = useState(text);
  const { visible } = useModules();
  const farms = useListMyFarms();
  const farm = farms.data ? pickActiveFarm(farms.data, readActiveFarmId()) : null;

  // Wait for a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    window.history.replaceState(null, "", query ? `?q=${encodeURIComponent(query)}` : window.location.pathname);
  }, [query]);

  const params = { q: query, ...(farm ? { farmId: farm.id } : {}) };
  const results = useSearch(params, { query: { queryKey: getSearchQueryKey(params), enabled: query.length >= 2 } });
  const pages = matchPages(query, visible);
  const groups: SearchGroup[] = results.data?.groups ?? [];
  const nothing = query.length >= 2 && !results.isFetching && pages.length === 0 && groups.length === 0;

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          // Text, not "search": the browser's own clear button would double ours.
          type="text"
          role="searchbox"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Suche"
          placeholder="Pflanze, Tier, Beet, Futter, Kontakt …"
          className="h-11 pl-9 pr-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text && (
          <button type="button" aria-label="Suche leeren" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setText("")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query.length < 2 ? (
        <p className="text-sm text-muted-foreground">Durchsucht die App, das Pflanzen- und Insekten-Lexikon und deine Farm{farm ? ` „${farm.name}“` : ""}.</p>
      ) : (
        <div className="space-y-4" data-testid="search-results">
          {pages.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <LayoutGrid className="h-3.5 w-3.5" />
                In der App
              </h2>
              <ul className="divide-y rounded-xl border bg-card">
                {pages.map((p) => (
                  <Row key={p.href} href={p.href} title={p.title} subtitle={p.hint} />
                ))}
              </ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.kind} className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {g.items.map((i, k) => (
                  <Row key={`${i.href}-${k}`} href={i.href} title={i.title} subtitle={i.subtitle} />
                ))}
              </ul>
            </section>
          ))}
          {results.isFetching && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {nothing && <p className="text-sm text-muted-foreground">Nichts gefunden für „{query}“.</p>}
        </div>
      )}
    </div>
  );
}
