import { useQueryClient } from "@tanstack/react-query";
import { Leaf } from "lucide-react";
import {
  getListFeedOriginsQueryKey,
  getListRationsQueryKey,
  useListFeedOrigins,
  useSetFeedOrigin,
  type FeedOrganic,
  type OrganicShares,
  type RationEvaluation,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Bio im Futterplaner (docs/bio.md, B3), shown on organic farms only: where
 * each feed comes from, and per ration the shares by dry matter against the
 * organic rules (Richtwerte).
 */

export const FEED_ORGANIC_LABELS: Record<FeedOrganic, string> = {
  organic: "Bio",
  conversion: "Umstellung",
  conventional: "Konventionell",
};

const CHECK_LABELS: Record<OrganicShares["checks"][number]["key"], string> = {
  organic: "Bio- und Umstellungsfutter",
  conversion: "Umstellungsfutter zugekauft",
  ownFarm: "Vom Hof oder aus der Region",
  roughage: "Raufutter und Grünfutter",
};

const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

/** The shares of one ration, with a traffic light per rule. */
export function OrganicSharesBox({ shares }: { shares: OrganicShares }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border p-3 text-xs" data-testid="organic-shares">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Leaf className="h-4 w-4 text-primary" />
        Bio-Futter
      </p>
      <table className="w-full">
        <tbody>
          {shares.checks.map((c) => (
            <tr key={c.key} className="border-t border-border first:border-t-0">
              <td className="py-1">{CHECK_LABELS[c.key]}</td>
              <td className="py-1 text-right tabular-nums">{pct(c.value)}</td>
              <td className="py-1 pl-2 text-right tabular-nums text-muted-foreground">
                {c.bound === "max" ? "höchst. " : c.target < 100 ? "mind. " : ""}
                {pct(c.target)}
              </td>
              <td className="py-1 pl-2">
                <span className={cn("inline-block h-2.5 w-2.5 rounded-full", c.ok ? "bg-emerald-500" : "bg-red-600")} aria-label={c.ok ? "erfüllt" : "nicht erfüllt"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shares.missing.length > 0 && (
        <p className="text-amber-800 dark:text-amber-300">Herkunft fehlt bei {shares.missing.join(", ")} – zählt als konventionell. Unten unter „Herkunft der Futtermittel“ eintragen.</p>
      )}
      <p className="text-muted-foreground">Auf die Trockenmasse gerechnet; Richtwerte nach EU-Öko-Verordnung.</p>
    </div>
  );
}

/** Every feed used in a ration of the farm, with its origin. */
export function FeedOriginsCard({ farmId, rations, canWrite }: { farmId: number; rations: readonly RationEvaluation[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const origins = useListFeedOrigins(farmId);
  const save = useSetFeedOrigin({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getListFeedOriginsQueryKey(farmId), data);
        void queryClient.invalidateQueries({ queryKey: getListRationsQueryKey(farmId) });
      },
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  const feeds = new Map<string, { feedKey: string | null; feedId: number | null; name: string }>();
  for (const r of rations) for (const i of r.items) feeds.set(i.feedKey ? `k:${i.feedKey}` : `o:${i.feedId}`, { feedKey: i.feedKey, feedId: i.feedId, name: i.name });
  const list = [...feeds.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const originOf = (f: { feedKey: string | null; feedId: number | null }) =>
    origins.data?.find((o) => (f.feedKey ? o.feedKey === f.feedKey : o.feedId === f.feedId));

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-testid="feed-origins">
      <h2 className="flex items-center gap-2 font-semibold">
        <Leaf className="h-4 w-4 text-primary" />
        Herkunft der Futtermittel
      </h2>
      <p className="text-xs text-muted-foreground">Für die Bio-Anteile der Rationen: bio, aus der Umstellung oder konventionell – und ob es vom eigenen Hof oder aus der Region kommt.</p>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sobald eine Ration angelegt ist, stehen ihre Futtermittel hier.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((f) => {
            const o = originOf(f);
            const send = (organic: FeedOrganic | null, ownFarm: boolean) => save.mutate({ farmId, data: { feedKey: f.feedKey, feedId: f.feedId, organic, ownFarm } });
            return (
              <li key={`${f.feedKey}-${f.feedId}`} className="space-y-1.5 py-2">
                <p className="font-medium">{f.name}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label={`Herkunft ${f.name}`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    disabled={!canWrite || save.isPending}
                    value={o?.organic ?? ""}
                    onChange={(e) => send(e.target.value === "" ? null : (e.target.value as FeedOrganic), o?.ownFarm ?? false)}
                  >
                    <option value="">– nicht angegeben –</option>
                    {(Object.keys(FEED_ORGANIC_LABELS) as FeedOrganic[]).map((k) => (
                      <option key={k} value={k}>
                        {FEED_ORGANIC_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      disabled={!canWrite || !o || save.isPending}
                      checked={o?.ownFarm ?? false}
                      onChange={(e) => o && send(o.organic, e.target.checked)}
                    />
                    vom Hof / aus der Region
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
