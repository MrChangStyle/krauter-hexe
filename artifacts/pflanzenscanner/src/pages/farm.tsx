import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Tractor,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  getListFarmMembersQueryKey,
  useAddFarmMember,
  useChangeFarmMemberRole,
  useCreateFarm,
  useDeleteFarm,
  useEnsureOwnFarm,
  useListFarmMembers,
  useRemoveFarmMember,
  useRenameFarm,
  type FarmMember,
  type FarmRole,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FARM_ROLE_HINTS,
  FARM_ROLE_LABELS,
  pickActiveFarm,
  readActiveFarmId,
  writeActiveFarmId,
} from "@/lib/active-farm";

const ROLES: FarmRole[] = ["admin", "caretaker", "guest"];

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ── Dialog for name input (new farm / rename / delete confirmation) ───────────

function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial,
  confirmLabel,
  destructive,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initial: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="farm-name-input">{label}</Label>
            <Input
              id="farm-name-input"
              value={value}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Members ──────────────────────────────────────────────────────────────────

function MembersCard({ farm, onLeft }: { farm: FarmSummary; onLeft: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = farm.role === "admin";
  const members = useListFarmMembers(farm.id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FarmRole>("caretaker");
  const [addError, setAddError] = useState<string | null>(null);

  const setList = (list: FarmMember[]) =>
    queryClient.setQueryData(getListFarmMembersQueryKey(farm.id), list);

  const add = useAddFarmMember({
    mutation: {
      onSuccess(list) {
        setList(list);
        setEmail("");
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
    add.mutate({ farmId: farm.id, data: { email: email.trim(), role } });
  }

  const me = members.data?.find((m) => m.isMe);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Users className="h-4 w-4 text-primary" />
        Mitglieder
      </h2>

      {members.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="divide-y divide-border">
          {(members.data ?? []).map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName}
                  {m.isMe && <span className="font-normal text-muted-foreground"> (du)</span>}
                </p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
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
                  {ROLES.map((r) => (
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
          <Label htmlFor="member-email" className="text-xs">
            Mitglied hinzufügen (die Person braucht ein Little-Farming-Konto)
          </Label>
          <Input
            id="member-email"
            type="email"
            inputMode="email"
            placeholder="name@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex min-w-0 gap-2">
            <select
              aria-label="Rolle für das neue Mitglied"
              className={`${selectClass} min-w-0 flex-1`}
              value={role}
              onChange={(e) => setRole(e.target.value as FarmRole)}
            >
              {ROLES.map((r) => (
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
          <p className="text-xs text-muted-foreground">
            {FARM_ROLE_LABELS[role]}: {FARM_ROLE_HINTS[role]}
          </p>
          {addError && (
            <p role="alert" className="text-xs text-destructive">
              {addError}
            </p>
          )}
        </form>
      )}

      {me && (members.data?.length ?? 0) > 1 && (
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

// ── Page ─────────────────────────────────────────────────────────────────────

/** "Meine Farm" – the animal module of Little Farming. */
export default function FarmPage() {
  const { toast } = useToast();
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(readActiveFarmId());
  const [dialog, setDialog] = useState<null | "new" | "rename" | "delete">(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const ensure = useEnsureOwnFarm({
    mutation: {
      onSuccess: (list) => setFarms(list),
    },
  });
  // First visit creates the account's own farm; later visits just list.
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const farm = farms ? pickActiveFarm(farms, activeId) : null;

  function select(id: number) {
    setActiveId(id);
    writeActiveFarmId(id);
  }

  const reload = () => ensure.mutate();

  const create = useCreateFarm({
    mutation: {
      onSuccess(newFarm) {
        setDialog(null);
        select(newFarm.id);
        reload();
        toast({ title: "Farm angelegt" });
      },
      onError: (err) => setDialogError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const rename = useRenameFarm({
    mutation: {
      onSuccess() {
        setDialog(null);
        reload();
      },
      onError: (err) => setDialogError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const remove = useDeleteFarm({
    mutation: {
      onSuccess() {
        setDialog(null);
        toast({ title: "Farm gelöscht" });
        reload();
      },
      onError: (err) => setDialogError(errorText(err, "Das hat nicht geklappt.")),
    },
  });

  function openDialog(kind: "new" | "rename" | "delete") {
    setDialogError(null);
    setDialog(kind);
  }

  if (ensure.isError && !farms) {
    return (
      <div className="px-4 pt-10 text-center text-sm text-muted-foreground">
        „Meine Farm“ konnte nicht geladen werden. Bist du online?
        <div className="mt-4">
          <Button variant="outline" onClick={reload}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (!farm) {
    return (
      <div className="flex justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = farm.role === "admin";

  return (
    <div className="space-y-5 px-4 pb-4 pt-6">
      <div className="space-y-2">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Meine Farm
        </span>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{farm.name}</h1>
            <p className="text-sm text-muted-foreground">
              Deine Rolle: {FARM_ROLE_LABELS[farm.role]} ({FARM_ROLE_HINTS[farm.role]})
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              aria-label="Farm umbenennen"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              onClick={() => openDialog("rename")}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {farms && farms.length > 1 && (
            <select
              aria-label="Farm wechseln"
              className={selectClass}
              value={farm.id}
              onChange={(e) => select(Number(e.target.value))}
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({FARM_ROLE_LABELS[f.role]})
                </option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openDialog("new")}>
            <Plus className="h-4 w-4" />
            Weitere Farm
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-dashed border-border p-6 text-center">
        <Tractor className="mx-auto mb-2 h-8 w-8 text-primary/70" />
        <p className="font-medium">Noch keine Tiere</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hier verwaltest du bald deine Tiere und Herden mit Gesundheitsakte, Gewicht und Stall-Aufgaben.
        </p>
      </section>

      <MembersCard
        farm={farm}
        onLeft={() => {
          setActiveId(null);
          reload();
        }}
      />

      {isAdmin && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
          onClick={() => openDialog("delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Farm löschen
        </button>
      )}

      <NameDialog
        open={dialog === "new"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Weitere Farm anlegen"
        description="Du wirst Admin der neuen Farm und kannst Mitglieder hinzufügen."
        label="Name der Farm"
        initial=""
        confirmLabel="Anlegen"
        busy={create.isPending}
        error={dialogError}
        onSubmit={(name) => create.mutate({ data: { name } })}
      />
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Farm umbenennen"
        label="Neuer Name"
        initial={farm.name}
        confirmLabel="Speichern"
        busy={rename.isPending}
        error={dialogError}
        onSubmit={(name) => rename.mutate({ farmId: farm.id, data: { name } })}
      />
      <NameDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Farm endgültig löschen?"
        description={`Alle Tiere, Gesundheitsakten und Einträge von „${farm.name}“ werden gelöscht – für alle Mitglieder. Gib zur Bestätigung den Namen der Farm ein.`}
        label="Name der Farm"
        initial=""
        confirmLabel="Endgültig löschen"
        destructive
        busy={remove.isPending}
        error={dialogError}
        onSubmit={(confirmName) => remove.mutate({ farmId: farm.id, data: { confirmName } })}
      />
    </div>
  );
}
