import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  Loader2,
  Pencil,
  Plus,
  Radar,
  Trash2,
  Users,
  Wheat, Pill, Handshake, Baby, PiggyBank, FileText, Warehouse, Hexagon, Trees } from "lucide-react";
import {
  useCreateFarm,
  useDeleteFarm,
  useEnsureOwnFarm,
  useGetDemoStatus,
  useRenameFarm,
  type FarmSummary,
  type ModuleId,
} from "@workspace/api-client-react";
import { FarmDutiesTile } from "@/components/farm-duties-link";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { FarmSetupCard } from "@/components/farm-setup-card";
import { HousingOrderBanner } from "@/components/housing-order-banner";
import { deDay } from "@/lib/medicine-labels";
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
import { useModules } from "@/hooks/use-modules";
import { farmModuleGranted } from "@/lib/modules";
import { MyAnimalsCard } from "@/components/farm-animals-section";
import { OrganicCheckCard } from "@/components/organic-check-card";
import { FarmTasksTile } from "@/components/farm-tasks-section";
import {
  FARM_ROLE_HINTS,
  FARM_ROLE_LABELS,
  pickActiveFarm,
  readActiveFarmId,
  writeActiveFarmId,
} from "@/lib/active-farm";

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

// ── Page ─────────────────────────────────────────────────────────────────────

/** "Meine Farm" – the animal module of Little Farming. */
export default function FarmPage() {
  const { toast } = useToast();
  const { visible } = useModules();
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
  const demo = useGetDemoStatus();

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
  // Hidden by the account, or not granted on this farm (Modul-Freigaben).
  const show = (id: ModuleId) => visible(id) && farmModuleGranted(farm, id);

  return (
    <div className="space-y-5 px-4 pb-4 pt-6">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Tiere</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{farm.name}</span> · {FARM_ROLE_LABELS[farm.role]} ({FARM_ROLE_HINTS[farm.role]})
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
      </div>

      {demo.data?.farmId === farm.id && (
        <Link href="/module" className="block rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100" data-testid="demo-banner">
          Das ist der <span className="font-medium">Demo-Hof</span> mit Beispieldaten. <span className="underline">Demo-Daten löschen</span> geht unter „Meine Module“.
        </Link>
      )}

      {farm.accessUntil && (
        <Link href="/farm/uebergabe" className="block rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Du vertrittst hier bis {deDay(farm.accessUntil)}. <span className="underline">Zur Übergabe</span> – was heute zu tun ist und was du wissen musst.
        </Link>
      )}

      <HousingOrderBanner farm={farm} link />

      <MyAnimalsCard farm={farm} />

      <OrganicCheckCard farm={farm} />

      {(show("farm-tasks") || show("yields")) && farm.role !== "guest" && (
        <Link
          href="/farm/stall"
          className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-card p-4 active:scale-[0.99]"
          data-testid="stall-link"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Warehouse className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Am Stall</span>
            <span className="block text-sm text-muted-foreground">Eier und Aufgaben mit einem Tipp – auch ohne Netz</span>
          </span>
        </Link>
      )}

      <HubGrid>
        {show("farm-tasks") && <FarmTasksTile farm={farm} />}
        {show("feed") && <HubTile href="/farm/futter" icon={Wheat} label="Futterplaner" hint="Rationen, Bedarf, Vorrat" tone="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300" />}
        {show("breeding") && <HubTile href="/farm/zucht" icon={Baby} label="Zucht" hint="Trächtigkeit, Brut, Jungtiere" tone="bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300" />}
        {show("medicines") && <HubTile href="/farm/arzneimittel" icon={Pill} label="Arzneimittel" hint="Vorrat, Charge, Wartezeit" tone="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" />}
        {show("duties") && <FarmDutiesTile farm={farm} />}
        {show("pasture") && <HubTile href="/farm/weide" icon={Trees} label="Weide" hint="Flächen, Umtreiben, Ruhezeit" tone="bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300" />}
        {show("bees") && <HubTile href="/farm/bienen" icon={Hexagon} label="Bienen" hint="Stockkarte, Varroa, Honig" tone="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" />}
        {show("yields") && <HubTile href="/farm/ertrag" icon={PiggyBank} label="Ertrag & Bilanz" hint="Eier, Milch, Ernte, Kosten" tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" />}
        {show("wildlife") && <HubTile href="/farm/kameras" icon={Radar} label="Wildtier-Radar" hint="Kameras & Raubtier-Alarm" tone="bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200" />}
        {show("handover") && <HubTile href="/farm/uebergabe" icon={Handshake} label="Übergabe" hint="Vertretung für ein paar Tage" tone="bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300" />}
        {show("members") && <HubTile href="/team" icon={Users} label="Farm & Team" hint="Team, Vertretung, Kontakte" tone="bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" />}
        {show("export") && <HubTile href="/farm/export" icon={FileText} label="Veterinäramt-Export" hint="Bestandsliste & Medizin als PDF" tone="bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300" />}
      </HubGrid>

      <FarmSetupCard farm={farm} onRename={() => openDialog("rename")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openDialog("new")}>
          <Plus className="h-4 w-4" />
          Weitere Farm
        </Button>
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
      </div>

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
