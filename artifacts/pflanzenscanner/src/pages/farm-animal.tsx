import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Camera, Loader2, PawPrint, Pencil } from "lucide-react";
import {
  getGetFarmAnimalQueryKey,
  getListFarmAnimalsQueryKey,
  getListHerdsQueryKey,
  setFarmAnimalPhoto,
  useCreateFarmAnimal,
  useGetFarm,
  useGetFarmAnimal,
  useListHerds,
  useSetFarmAnimalArchived,
  useUpdateFarmAnimal,
  type AnimalSex,
  type FarmAnimal,
  type FarmAnimalInput,
  type FarmSpecies,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MedicalSection, WeightSection } from "@/components/farm-animal-health";
import { FeedSection, HusbandrySection, SpeciesSuggestionBox, ToxicPlantsSection } from "@/components/farm-ai";
import { downscaleFile } from "@/lib/image";
import { SEX_LABELS, SPECIES_LABELS, SPECIES_ORDER, ageText, todayIso } from "@/lib/farm-labels";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const EMPTY: FarmAnimalInput = {
  name: "",
  species: "poultry",
  breed: "",
  birthDate: "",
  sex: "female",
  registrationNumber: "",
  herdId: null,
  notes: "",
};

function toInput(a: FarmAnimal): FarmAnimalInput {
  return {
    name: a.name,
    species: a.species,
    breed: a.breed ?? "",
    birthDate: a.birthDate ?? "",
    sex: a.sex,
    registrationNumber: a.registrationNumber,
    herdId: a.herdId,
    notes: a.notes ?? "",
  };
}

// ── Photo picker ─────────────────────────────────────────────────────────────

function PhotoPicker({
  value,
  onChange,
  required,
}: {
  value: string | null;
  onChange: (dataUrl: string) => void;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-20 w-20 rounded-xl object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
          <PawPrint className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            // Same downscaling as plant scans: ~100–180 KB instead of several MB.
            onChange(await downscaleFile(file));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {value ? "Anderes Foto" : `Foto wählen${required ? " *" : ""}`}
      </Button>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function AnimalForm({
  farmId,
  initial,
  photoRequired,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  farmId: number;
  initial: FarmAnimalInput;
  photoRequired: boolean;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: FarmAnimalInput, photo: string | null) => void;
  onCancel: () => void;
}) {
  const herds = useListHerds(farmId);
  const [form, setForm] = useState<FarmAnimalInput>(initial);
  const [photo, setPhoto] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof FarmAnimalInput>(key: K, value: FarmAnimalInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (photoRequired && !photo) {
      setLocalError("Bitte wähle ein Foto des Tieres.");
      return;
    }
    setLocalError(null);
    onSubmit(
      {
        ...form,
        breed: form.breed?.trim() || null,
        notes: form.notes?.trim() || null,
      },
      photo,
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PhotoPicker value={photo} onChange={setPhoto} required={photoRequired} />
      {photo && (
        <SpeciesSuggestionBox
          farmId={farmId}
          photo={photo}
          onApply={(species, breed) => {
            set("species", species);
            if (breed) set("breed", breed);
          }}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-name">Name *</Label>
        <Input id="animal-name" required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="animal-species">Tierart *</Label>
          <select id="animal-species" className={selectClass} value={form.species} onChange={(e) => set("species", e.target.value as FarmSpecies)}>
            {SPECIES_ORDER.map((s) => (
              <option key={s} value={s}>
                {SPECIES_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="animal-sex">Geschlecht *</Label>
          <select id="animal-sex" className={selectClass} value={form.sex} onChange={(e) => set("sex", e.target.value as AnimalSex)}>
            {(Object.keys(SEX_LABELS) as AnimalSex[]).map((s) => (
              <option key={s} value={s}>
                {SEX_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="animal-birth">Geburtsdatum *</Label>
          <Input
            id="animal-birth"
            type="date"
            required
            max={todayIso()}
            value={form.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="animal-breed">Rasse</Label>
          <Input id="animal-breed" maxLength={60} value={form.breed ?? ""} onChange={(e) => set("breed", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-reg">Ring- / Ohrmarkennummer *</Label>
        <Input
          id="animal-reg"
          required
          maxLength={40}
          className="font-mono"
          value={form.registrationNumber}
          onChange={(e) => set("registrationNumber", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-herd">Herde</Label>
        <select
          id="animal-herd"
          className={selectClass}
          value={form.herdId ?? ""}
          onChange={(e) => set("herdId", e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">keine</option>
          {(herds.data ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-notes">Notizen</Label>
        <Textarea id="animal-notes" rows={3} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {(localError || error) && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {localError || error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button type="submit" className="flex-1 gap-2" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────

function useRefreshFarmData(farmId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: getListFarmAnimalsQueryKey(farmId) });
    void queryClient.invalidateQueries({ queryKey: getListHerdsQueryKey(farmId) });
  };
}

/** Uploads the photo; a failure keeps the animal and says so. */
async function uploadPhoto(
  farmId: number,
  animalId: number,
  photo: string,
  toast: ReturnType<typeof useToast>["toast"],
): Promise<FarmAnimal | null> {
  try {
    return await setFarmAnimalPhoto(farmId, animalId, { imageData: photo });
  } catch (err) {
    toast({
      title: "Foto nicht gespeichert",
      description: errorText(err, "Das Tier ist angelegt – das Foto kannst du später ergänzen."),
      variant: "destructive",
    });
    return null;
  }
}

function BackLink() {
  return (
    <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Meine Farm
    </Link>
  );
}

function NewAnimalPage({ farmId }: { farmId: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const refresh = useRefreshFarmData(farmId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useCreateFarmAnimal();

  async function save(input: FarmAnimalInput, photo: string | null) {
    setBusy(true);
    setError(null);
    try {
      const animal = await create.mutateAsync({ farmId, data: input });
      // Only one toast shows at a time: a photo failure must not be replaced.
      const photoSaved = !photo || (await uploadPhoto(farmId, animal.id, photo, toast)) !== null;
      refresh();
      if (photoSaved) toast({ title: `${animal.name} angelegt` });
      setLocation(`/farm/${farmId}/tier/${animal.id}`);
    } catch (err) {
      setError(errorText(err, "Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-6">
      <BackLink />
      <h1 className="text-2xl font-bold">Tier anlegen</h1>
      <AnimalForm
        farmId={farmId}
        initial={EMPTY}
        photoRequired
        submitLabel="Anlegen"
        busy={busy}
        error={error}
        onSubmit={(input, photo) => void save(input, photo)}
        onCancel={() => setLocation("/farm")}
      />
    </div>
  );
}

function AnimalDetailPage({ farmId, animalId }: { farmId: number; animalId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshFarmData(farmId);
  const farm = useGetFarm(farmId);
  const animal = useGetFarmAnimal(farmId, animalId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = useUpdateFarmAnimal();
  const archive = useSetFarmAnimalArchived({
    mutation: {
      onSuccess(updated) {
        queryClient.setQueryData(getGetFarmAnimalQueryKey(farmId, animalId), updated);
        refresh();
        toast({ title: updated.archivedAt ? "Archiviert" : "Wiederhergestellt" });
      },
    },
  });
  const canWrite = farm.data ? farm.data.role !== "guest" : false;

  useEffect(() => setEditing(false), [animalId]);

  async function save(input: FarmAnimalInput, photo: string | null) {
    setBusy(true);
    setError(null);
    try {
      let updated = await update.mutateAsync({ farmId, animalId, data: input });
      if (photo) updated = (await uploadPhoto(farmId, animalId, photo, toast)) ?? updated;
      queryClient.setQueryData(getGetFarmAnimalQueryKey(farmId, animalId), updated);
      refresh();
      setEditing(false);
    } catch (err) {
      setError(errorText(err, "Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  if (animal.isLoading) {
    return (
      <div className="flex justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!animal.data) {
    return (
      <div className="space-y-4 px-4 pt-6">
        <BackLink />
        <p className="text-sm text-muted-foreground">Dieses Tier gibt es nicht (mehr).</p>
      </div>
    );
  }

  const a = animal.data;
  const age = ageText(a.birthDate);

  if (editing) {
    return (
      <div className="space-y-4 px-4 pb-6 pt-6">
        <BackLink />
        <h1 className="text-2xl font-bold">{a.name} bearbeiten</h1>
        <AnimalForm
          farmId={farmId}
          initial={toInput(a)}
          photoRequired={false}
          submitLabel="Speichern"
          busy={busy}
          error={error}
          onSubmit={(input, photo) => void save(input, photo)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const facts: Array<[string, string]> = [
    ["Tierart", SPECIES_LABELS[a.species]],
    ["Rasse", a.breed ?? "–"],
    ["Geschlecht", SEX_LABELS[a.sex]],
    ["Geboren", a.birthDate ? `${new Date(`${a.birthDate}T12:00:00`).toLocaleDateString("de-DE")}${age ? ` (${age})` : ""}` : "–"],
    ["Ring / Ohrmarke", a.registrationNumber],
    ["Herde", a.herdName ?? "–"],
  ];

  return (
    <div className="space-y-5 pb-6">
      {a.imageUrl ? (
        <img src={a.imageUrl} alt={a.name} className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
          <PawPrint className="h-12 w-12 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-5 px-4">
        <BackLink />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{a.name}</h1>
            {a.archivedAt && <p className="text-sm text-muted-foreground">Archiviert</p>}
          </div>
          {canWrite && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Button>
          )}
        </div>

        <dl className="divide-y divide-border rounded-xl border border-border bg-card">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={label === "Ring / Ohrmarke" ? "text-right font-mono" : "text-right"}>{value}</dd>
            </div>
          ))}
        </dl>

        {a.notes && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold">Notizen</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.notes}</p>
          </section>
        )}

        <MedicalSection farmId={farmId} animalId={animalId} canWrite={canWrite} />
        <WeightSection farmId={farmId} animalId={animalId} canWrite={canWrite} />
        <FeedSection farmId={farmId} animalId={animalId} canWrite={canWrite} />
        <ToxicPlantsSection farmId={farmId} species={a.species} />
        <HusbandrySection farmId={farmId} species={a.species} />

        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={archive.isPending}
            onClick={() => {
              const archiving = !a.archivedAt;
              if (
                !archiving ||
                window.confirm(`${a.name} archivieren? Die Gesundheitsakte bleibt erhalten, das Tier erscheint nicht mehr in der Liste.`)
              ) {
                archive.mutate({ farmId, animalId, data: { archived: archiving } });
              }
            }}
          >
            {a.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {a.archivedAt ? "Wiederherstellen" : "Archivieren"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** /farm/:farmId/tier/neu and /farm/:farmId/tier/:animalId */
export default function FarmAnimalPage() {
  const params = useParams<{ farmId: string; animalId: string }>();
  const farmId = Number(params.farmId);
  if (!Number.isInteger(farmId) || farmId <= 0) return null;
  if (params.animalId === "neu") return <NewAnimalPage farmId={farmId} />;
  const animalId = Number(params.animalId);
  if (!Number.isInteger(animalId) || animalId <= 0) return null;
  return <AnimalDetailPage farmId={farmId} animalId={animalId} />;
}
