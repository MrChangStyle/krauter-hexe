import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Handshake, Loader2, LogOut, UserPlus, Users, X } from "lucide-react";
import {
  getListFarmMembersQueryKey,
  useAddFarmMember,
  useChangeFarmMemberRole,
  useListFarmMembers,
  useRemoveFarmMember,
  type FarmMember,
  type FarmRole,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FARM_ROLE_HINTS, FARM_ROLE_LABELS } from "@/lib/active-farm";
import { deDay } from "@/lib/medicine-labels";
import { berlinToday } from "@/lib/weather-labels";

const ROLES: FarmRole[] = ["admin", "caretaker", "guest"];

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Members of a farm: roles, adding and leaving. Farm & Team shows it twice –
 * "team" (no end) and "substitute" (Vertretung, access until a day) – built
 * the same, worded apart.
 */
export function MembersCard({ farm, onLeft, kind = "team" }: { farm: FarmSummary; onLeft: () => void; kind?: "team" | "substitute" }) {
  const substitute = kind === "substitute";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = farm.role === "admin";
  const members = useListFarmMembers(farm.id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FarmRole>("caretaker");
  // Vertretung: last day of access (empty: no end). Not for admins.
  const [until, setUntil] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const setList = (list: FarmMember[]) =>
    queryClient.setQueryData(getListFarmMembersQueryKey(farm.id), list);

  const add = useAddFarmMember({
    mutation: {
      onSuccess(list) {
        setList(list);
        setEmail("");
        setUntil("");
        setAddError(null);
        toast({ title: "Mitglied hinzugefügt" });
      },
      onError: (err) => setAddError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const change = useChangeFarmMemberRole({
    mutation: {
      onSuccess: setList,
      onError: (err) =>
        toast({ title: "Rolle nicht geändert", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const remove = useRemoveFarmMember({
    mutation: {
      onSuccess(_data, vars) {
        const me = members.data?.find((m) => m.isMe);
        if (me && vars.userId === me.userId) {
          toast({ title: "Du hast die Farm verlassen" });
          onLeft();
          return;
        }
        void queryClient.invalidateQueries({ queryKey: getListFarmMembersQueryKey(farm.id) });
      },
      onError: (err) =>
        toast({ title: "Das hat nicht geklappt", description: errorText(err, ""), variant: "destructive" }),
    },
  });

  function submitAdd(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    if (substitute && !until) {
      setAddError("Bis wann vertritt die Person? Bitte das Datum angeben.");
      return;
    }
    add.mutate({ farmId: farm.id, data: { email: email.trim(), role, accessUntil: substitute ? until : null } });
  }

  const me = members.data?.find((m) => m.isMe);
  const shown = (members.data ?? []).filter((m) => !!m.accessUntil === substitute);
  const roles = substitute ? ROLES.filter((r) => r !== "admin") : ROLES;
  const Icon = substitute ? Handshake : Users;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" data-testid={`members-${kind}`}>
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {substitute ? "Vertretung" : "Team"}
        <span className="text-sm font-normal text-muted-foreground">({shown.length})</span>
      </h2>
      {substitute && (
        <p className="text-xs text-muted-foreground">Wer für ein paar Tage einspringt. Der Zugang endet nach dem gewählten Tag von selbst; die Übergabe-Seite zeigt, was die Vertretung wissen muss.</p>
      )}

      {members.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{substitute ? "Gerade vertritt niemand." : "Noch niemand im Team."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName}
                  {m.isMe && <span className="font-normal text-muted-foreground"> (du)</span>}
                </p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                {m.accessUntil && (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    Vertretung bis {deDay(m.accessUntil)}
                    {isAdmin && (
                      <>
                        {" · "}
                        <label className="sr-only" htmlFor={`until-${m.userId}`}>{`Vertretung von ${m.displayName} bis`}</label>
                        <input
                          id={`until-${m.userId}`}
                          type="date"
                          className="rounded border border-input bg-background px-1 text-xs"
                          value={m.accessUntil}
                          min={berlinToday()}
                          onChange={(e) =>
                            e.target.value && change.mutate({ farmId: farm.id, userId: m.userId, data: { role: m.role, accessUntil: e.target.value } })
                          }
                        />
                      </>
                    )}
                  </p>
                )}
              </div>
              {isAdmin ? (
                <select
                  aria-label={`Rolle von ${m.displayName}`}
                  className={selectClass}
                  value={m.role}
                  disabled={change.isPending}
                  onChange={(e) =>
                    change.mutate({ farmId: farm.id, userId: m.userId, data: { role: e.target.value as FarmRole } })
                  }
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {FARM_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{FARM_ROLE_LABELS[m.role]}</span>
              )}
              {isAdmin && !m.isMe && (
                <button
                  type="button"
                  aria-label={`${m.displayName} entfernen`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`${m.displayName} von der Farm entfernen?`)) {
                      remove.mutate({ farmId: farm.id, userId: m.userId });
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form onSubmit={submitAdd} className="min-w-0 space-y-2 rounded-lg bg-muted/40 p-3">
          <Label htmlFor={`member-email-${kind}`} className="text-xs">
            {substitute ? "Vertretung eintragen" : "Ins Team holen"} (die Person braucht ein Little-Farming-Konto)
          </Label>
          <Input
            id={`member-email-${kind}`}
            type="email"
            inputMode="email"
            placeholder="name@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex min-w-0 gap-2">
            <select
              aria-label={substitute ? "Rolle der Vertretung" : "Rolle für das neue Mitglied"}
              className={`${selectClass} min-w-0 flex-1`}
              value={role}
              onChange={(e) => setRole(e.target.value as FarmRole)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {FARM_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" className="gap-1.5" disabled={add.isPending || !email.trim()}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Hinzufügen
            </Button>
          </div>
          {substitute && (
            <div className="flex items-center gap-2">
              <Label htmlFor="member-until" className="text-xs">
                Vertretung bis
              </Label>
              <Input id="member-until" type="date" className="h-8 w-40" min={berlinToday()} value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {FARM_ROLE_LABELS[role]}: {FARM_ROLE_HINTS[role]}
            {substitute && until && ` Der Zugang endet nach dem ${deDay(until)} von selbst.`}
          </p>
          {addError && (
            <p role="alert" className="text-xs text-destructive">
              {addError}
            </p>
          )}
        </form>
      )}

      {me && shown.includes(me) && (members.data?.length ?? 0) > 1 && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
          onClick={() => {
            if (window.confirm(`„${farm.name}“ verlassen? Du siehst ihre Tiere danach nicht mehr.`)) {
              remove.mutate({ farmId: farm.id, userId: me.userId });
            }
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Farm verlassen
        </button>
      )}
    </section>
  );
}
