import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import {
  getGetFarmFarmingQueryKey,
  getListFarmContactsQueryKey,
  getListFarmMembersQueryKey,
  useGetFarmFarming,
  useListFarmContacts,
  useListFarmMembers,
  type FarmSummary,
} from "@workspace/api-client-react";
import { FarmContactsCard } from "@/components/farm-contacts-card";
import { FarmFarmingCard } from "@/components/farm-farming-card";
import { SustainabilityCard } from "@/components/sustainability-card";
import { MembersCard } from "@/components/farm-members-card";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { FARM_ROLE_HINTS, FARM_ROLE_LABELS } from "@/lib/active-farm";
import { FARMING_LABELS } from "@/lib/farming-labels";
import { tileOf, type LookKey } from "@/lib/module-look";
import { PageHeader } from "@/components/page-header";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function count(n: number | undefined, one: string, many: string): string | null {
  return n === undefined ? null : `${n} ${n === 1 ? one : many}`;
}

/** The farm switch and "who am I here", on the hub and on every part. */
function FarmLine() {
  const { farm, farms, select } = useActiveFarm();
  if (!farm) return null;
  return (
    <div className="space-y-2">
      {farms && farms.length > 1 && (
        <select aria-label="Farm wechseln" className={selectClass} value={farm.id} onChange={(e) => select(Number(e.target.value))}>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({FARM_ROLE_LABELS[f.role]})
            </option>
          ))}
        </select>
      )}
      <p className="text-sm">
        <span className="font-medium">{farm.name}</span> · du bist {FARM_ROLE_LABELS[farm.role]} ({FARM_ROLE_HINTS[farm.role]})
      </p>
    </div>
  );
}

function Loading() {
  const { failed } = useActiveFarm();
  return failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />;
}

/**
 * /team – Farm & Team as tiles (docs/DESIGN.md): nothing open on the page,
 * every part on its own page with the counts on its tile.
 */
export default function TeamPage() {
  const { farm } = useActiveFarm();
  const id = farm?.id ?? 0;
  // Same keys as the parts, so the counts follow their changes.
  const members = useListFarmMembers(id, { query: { queryKey: getListFarmMembersQueryKey(id), enabled: !!farm } });
  const contacts = useListFarmContacts(id, { query: { queryKey: getListFarmContactsQueryKey(id), enabled: !!farm } });
  const farming = useGetFarmFarming(id, { query: { queryKey: getGetFarmFarmingQueryKey(id), enabled: !!farm } });
  const list = members.data;

  const tile = (key: LookKey, hint?: string | null) => {
    const t = tileOf(key);
    return <HubTile {...t} hint={hint ?? t.hint} />;
  };

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look="team" subtitle="Alle Menschen auf deinem Hof: Team, Vertretung, Rollen und wichtige Kontakte." />
      {!farm ? (
        <Loading />
      ) : (
        <>
          <FarmLine />
          <HubGrid>
            {tile("team-mitglieder", count(list?.filter((m) => !m.accessUntil).length, "Person im Team", "Personen im Team"))}
            {tile("team-vertretung", count(list?.filter((m) => m.accessUntil).length, "Vertretung", "Vertretungen"))}
            {tile("uebergabe")}
            {tile("team-kontakte", count(contacts.data?.length, "Kontakt", "Kontakte"))}
            {tile("bewirtschaftung", farming.data ? FARMING_LABELS[farming.data.level] : null)}
            {tile("nachhaltigkeit")}
          </HubGrid>
        </>
      )}
    </div>
  );
}

const SECTIONS: Record<string, { look: LookKey; body: (farm: FarmSummary, left: () => void) => React.ReactNode }> = {
  mitglieder: {
    look: "team-mitglieder",
    body: (farm, left) => (
      <>
        <details className="rounded-xl border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Was dürfen die Rollen?</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {(["admin", "caretaker", "guest"] as const).map((r) => (
              <li key={r}>
                <span className="font-medium text-foreground">{FARM_ROLE_LABELS[r]}</span>: {FARM_ROLE_HINTS[r]}
              </li>
            ))}
          </ul>
        </details>
        <MembersCard farm={farm} kind="team" onLeft={left} />
      </>
    ),
  },
  vertretung: { look: "team-vertretung", body: (farm, left) => <MembersCard farm={farm} kind="substitute" onLeft={left} /> },
  kontakte: { look: "team-kontakte", body: (farm) => <FarmContactsCard farm={farm} /> },
  bewirtschaftung: { look: "bewirtschaftung", body: (farm) => <FarmFarmingCard farm={farm} /> },
  nachhaltigkeit: { look: "nachhaltigkeit", body: (farm) => <SustainabilityCard farm={farm} /> },
};

/** /team/:section – one part of Farm & Team on its own page. */
export function TeamSectionPage({ params }: { params: { section: string } }) {
  const { farm } = useActiveFarm();
  const [, navigate] = useLocation();
  const section = SECTIONS[params.section];
  if (!section) {
    navigate("/team", { replace: true });
    return null;
  }
  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <PageHeader look={section.look} />
      {!farm ? (
        <Loading />
      ) : (
        <>
          <FarmLine />
          {section.body(farm, () => navigate("/mehr"))}
        </>
      )}
    </div>
  );
}
