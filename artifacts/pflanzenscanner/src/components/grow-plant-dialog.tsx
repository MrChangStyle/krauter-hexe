import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import type { GrowFlowering, GrowPlant, GrowPlantInput, GrowSeedSex, StrainType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/farm-labels";
import { FLOWERING_LABELS, SEED_SEX_LABELS, STRAIN_TYPE_LABELS, defaultFlowerWeeks } from "@/lib/grow-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** Add a plant, or change one (incl. the 12/12 day and the harvest). */
export function GrowPlantDialog({
  plant,
  busy,
  onSubmit,
  onClose,
}: {
  plant: GrowPlant | null;
  busy: boolean;
  onSubmit: (data: GrowPlantInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(plant?.name ?? "");
  const [strain, setStrain] = useState(plant?.strain ?? "");
  const [breeder, setBreeder] = useState(plant?.breeder ?? "");
  const [strainType, setStrainType] = useState<StrainType>(plant?.strainType ?? "hybrid");
  const [flowering, setFlowering] = useState<GrowFlowering>(plant?.flowering ?? "photo");
  const [seedSex, setSeedSex] = useState<GrowSeedSex>(plant?.seedSex ?? "feminized");
  const [weeks, setWeeks] = useState(plant ? String(plant.flowerWeeks) : "");
  const [startedOn, setStartedOn] = useState(plant?.startedOn ?? todayIso());
  const [flipOn, setFlipOn] = useState(plant?.flipOn ?? "");
  const [harvestedOn, setHarvestedOn] = useState(plant?.harvestedOn ?? "");
  const [wet, setWet] = useState(plant?.wetGrams != null ? String(plant.wetGrams).replace(".", ",") : "");
  const [dry, setDry] = useState(plant?.dryGrams != null ? String(plant.dryGrams).replace(".", ",") : "");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      strain: strain.trim() || null,
      breeder: breeder.trim() || null,
      strainType,
      flowering,
      seedSex,
      flowerWeeks: weeks ? Number(weeks) : null,
      startedOn,
      flipOn: flowering === "photo" && flipOn ? flipOn : null,
      harvestedOn: harvestedOn || null,
      wetGrams: num(wet),
      dryGrams: num(dry),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plant ? "Pflanze ändern" : "Pflanze anlegen"}</DialogTitle>
          <DialogDescription>Aus Typ, Keimdatum und Blütezeit entsteht der Grow-Plan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gp-name">Name</Label>
            <Input id="gp-name" maxLength={60} required value={name} placeholder="z. B. Pflanze 1" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-strain">Sorte</Label>
              <Input id="gp-strain" maxLength={60} value={strain} onChange={(e) => setStrain(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-breeder">Züchter</Label>
              <Input id="gp-breeder" maxLength={60} value={breeder} onChange={(e) => setBreeder(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-type">Typ</Label>
              <select id="gp-type" className={selectClass} value={strainType} onChange={(e) => setStrainType(e.target.value as StrainType)}>
                {(Object.keys(STRAIN_TYPE_LABELS) as StrainType[]).map((t) => (
                  <option key={t} value={t}>
                    {STRAIN_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-flowering">Blüte</Label>
              <select id="gp-flowering" className={selectClass} value={flowering} onChange={(e) => setFlowering(e.target.value as GrowFlowering)}>
                {(Object.keys(FLOWERING_LABELS) as GrowFlowering[]).map((f) => (
                  <option key={f} value={f}>
                    {FLOWERING_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-sex">Samen</Label>
              <select id="gp-sex" className={selectClass} value={seedSex} onChange={(e) => setSeedSex(e.target.value as GrowSeedSex)}>
                {(Object.keys(SEED_SEX_LABELS) as GrowSeedSex[]).map((s) => (
                  <option key={s} value={s}>
                    {SEED_SEX_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-weeks">Blütezeit (Wochen)</Label>
              <Input id="gp-weeks" type="number" min={5} max={16} value={weeks} placeholder={String(defaultFlowerWeeks(strainType, flowering))} onChange={(e) => setWeeks(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gp-start">Gekeimt am</Label>
              <Input id="gp-start" type="date" max={todayIso()} required value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            {flowering === "photo" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gp-flip">12/12 ab</Label>
                <Input id="gp-flip" type="date" value={flipOn} onChange={(e) => setFlipOn(e.target.value)} />
              </div>
            )}
          </div>
          {plant && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Ernte</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gp-harvest">Geerntet am</Label>
                <Input id="gp-harvest" type="date" max={todayIso()} value={harvestedOn} onChange={(e) => setHarvestedOn(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gp-wet">Nass (g)</Label>
                  <Input id="gp-wet" inputMode="decimal" value={wet} onChange={(e) => setWet(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gp-dry">Trocken (g)</Label>
                  <Input id="gp-dry" inputMode="decimal" value={dry} onChange={(e) => setDry(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
