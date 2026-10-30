import { Link, useLocation } from "wouter";
import { ArrowLeft, ChevronRight, Handshake, Loader2 } from "lucide-react";
import { getListFarmContactsQueryKey, getListFarmMembersQueryKey, useListFarmContacts, useListFarmMembers } from "@workspace/api-client-react";
import { FarmContactsCard } from "@/components/farm-contacts-card";
import { FarmFarmingCard } from "@/components/farm-farming-card";
import { MembersCard } from "@/components/farm-members-card";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { FARM_ROLE_HINTS, FARM_ROLE_LABELS } from "@/lib/active-farm";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Count({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className="text-xl font-bold tabular-nums">{n ?? "–"}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** /team – Farm & Team: the people of the farm – Team, Vertretung, roles and the important contacts. */
export default function TeamPage() {
  const { farm, farms, failed, select } = useActiveFarm();
  const [, navigate] = useLocation();
  const id = farm?.id ?? 0;
  // Same keys as the cards below, so the counts follow their changes.
  const members = useListFarmMembers(id, { query: { queryKey: getListFarmMembersQueryKey(id), enabled: !!farm } });
  const contacts = useListFarmContacts(id, { query: { queryKey: getListFarmContactsQueryKey(id), enabled: !!farm } });
  const list = members.data;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Farm & Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alle Menschen auf deinem Hof: Team, Vertretung, Rollen und wichtige Kontakte.</p>
        </div>
        {farms && farms.length > 1 && farm && (
          <select aria-label="Farm wechseln" className={selectClass} value={farm.id} onChange={(e) => select(Number(e.target.value))}>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({FARM_ROLE_LABELS[f.role]})
              </option>
            ))}
          </select>
        )}
      </div>
      {!farm ? (
        failed ? <p className="text-sm text-muted-foreground">Die Farm konnte nicht geladen werden. Bist du online?</p> : <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <>
          <p className="text-sm">
            <span className="font-medium">{farm.name}</span> · du bist {FARM_ROLE_LABELS[farm.role]} ({FARM_ROLE_HINTS[farm.role]})
          </p>
          <div className="grid grid-cols-3 gap-2" data-testid="team-counts">
            <Count n={list?.filter((m) => !m.accessUntil).length} label="im Team" />
            <Count n={list?.filter((m) => m.accessUntil).length} label="Vertretung" />
            <Count n={contacts.data?.length} label="Kontakte" />
          </div>
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
          <MembersCard farm={farm} kind="team" onLeft={() => navigate("/mehr")} />
          <MembersCard farm={farm} kind="substitute" onLeft={() => navigate("/mehr")} />
          <Link href="/farm/uebergabe" className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/40">
            <Handshake className="h-5 w-5 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Übergabe</span>
              <span className="block text-xs text-muted-foreground">Was die Vertretung sieht: Hinweise, heutige Aufgaben, Wartezeiten.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <FarmContactsCard farm={farm} />
          <FarmFarmingCard farm={farm} />
        </>
      )}
    </div>
  );
}
