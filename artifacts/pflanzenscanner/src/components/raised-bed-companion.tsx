import { Layers, Leaf, Snowflake } from "lucide-react";
import type { BedPlanting, Crop, GardenBed } from "@workspace/api-client-react";
import { HenniTip } from "@/components/henni";
import { PremiumBadge } from "@/components/premium-badge";
import { shortDay, todayKey } from "@/lib/garden-calendar";
import { lateDates, raisedBedLayers, raisedBedYear, recommendedFeeder, refillLiters, seasonExtension, tooHungry } from "@/lib/raised-bed";

const FEEDER_TEXT = {
  heavy: "Starkzehrer wie Tomaten, Kohl, Zucchini und Kürbis",
  medium: "Mittelzehrer wie Möhren, Kohlrabi, Fenchel und Rote Bete",
  light: "Schwachzehrer wie Salat, Bohnen, Erbsen, Radieschen und Kräuter",
} as const;

const l = (n: number) => `${n.toLocaleString("de-DE")} l`;

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
        <PremiumBadge />
      </h2>
      {children}
    </section>
  );
}

/** Hochbeet-Begleiter: layers, the bed's year and topping up. */
export function RaisedBedCompanion({ bed, season, plantings, crops }: { bed: GardenBed; season: number; plantings: BedPlanting[]; crops: Map<string, Crop> }) {
  const { meshM2, layers } = raisedBedLayers(bed);
  const year = raisedBedYear(bed.builtYear, season);
  const feeder = year === null ? null : recommendedFeeder(year);
  const hungry = year === null ? [] : tooHungry(plantings, crops, year);

  return (
    <Section icon={<Layers className="h-4 w-4 text-amber-700" />} title="Hochbeet-Begleiter">
      {year === null ? (
        <p className="text-muted-foreground">Trag beim Bearbeiten ein, in welchem Jahr das Hochbeet befüllt wurde – dann sagt dir der Begleiter, was es gerade am besten ernährt.</p>
      ) : feeder ? (
        <HenniTip>
          {year}. Jahr im Hochbeet: am besten {FEEDER_TEXT[feeder]}.
          {hungry.length > 0 && ` ${hungry.join(", ")} ${hungry.length === 1 ? "braucht" : "brauchen"} jetzt mehr, als der Boden noch hergibt.`}
        </HenniTip>
      ) : (
        <HenniTip>
          {year}. Jahr: Die Füllung ist zusammengesackt und ausgelaugt. Setz das Hochbeet neu auf oder frisch es kräftig mit Kompost auf – danach wieder Starkzehrer.
        </HenniTip>
      )}

      <div className="space-y-1.5">
        <p className="font-medium">Schichtaufbau für {bed.heightCm ?? 80} cm Höhe</p>
        <ol className="space-y-1.5">
          {[...layers].reverse().map((layer) => (
            <li key={layer.name} className="grid grid-cols-[3rem_1fr] gap-2">
              <span className="font-semibold tabular-nums">{layer.cm} cm</span>
              <span>
                <span className="font-medium">{layer.name}</span> · {l(layer.liters)}
                {layer.bags !== null && ` (ca. ${layer.bags} Säcke à 40 l)`}
                <span className="block text-xs text-muted-foreground">{layer.hint}</span>
              </span>
            </li>
          ))}
          <li className="grid grid-cols-[3rem_1fr] gap-2">
            <span className="font-semibold">unten</span>
            <span>
              <span className="font-medium">Wühlmausgitter</span> · {meshM2.toLocaleString("de-DE")} m²
              <span className="block text-xs text-muted-foreground">mit 10 cm Überstand an jeder Seite</span>
            </span>
          </li>
        </ol>
      </div>

      <p>
        <span className="font-medium">Auffüllen:</span> Die Füllung sackt jedes Jahr um etwa 10 cm. Nach der Ernte rund {l(refillLiters(bed))} Kompost oder Erde
        nachfüllen und mit Mist oder Hornspänen anreichern; über den Winter mulchen.
      </p>
    </Section>
  );
}

/** Letzte Pflanztermine and how protection stretches the season – every bed. */
export function AutumnCard({ bed, season, catalog }: { bed: GardenBed; season: number; catalog: Crop[] }) {
  const today = todayKey();
  const late = lateDates(catalog, bed.lastFrost, bed.firstFrost, season, today);
  const stretch = seasonExtension(bed.type, bed.firstFrost, season);
  const verb = { direct_sow: "säen", plant_out: "pflanzen" } as const;

  return (
    <Section icon={<Snowflake className="h-4 w-4 text-sky-600" />} title={`Herbst ${season}`}>
      {late.length > 0 ? (
        <>
          <p className="font-medium">Letzte Termine für dieses Beet</p>
          <ul className="space-y-1">
            {late.map((d) => (
              <li key={`${d.crop.key}-${d.kind}`} className="flex items-center gap-2">
                <Leaf className="h-3.5 w-3.5 shrink-0" style={{ color: d.crop.color }} />
                <span className="flex-1">
                  {d.crop.name} {verb[d.kind]}
                </span>
                <span className="tabular-nums text-muted-foreground">bis {shortDay(d.until)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground">Für dieses Jahr ist die Pflanzzeit vorbei – jetzt abernten, auffüllen und mulchen.</p>
      )}
      <p className="pt-1 font-medium">Ernten bis zum Frost</p>
      <ul className="space-y-1">
        {stretch.map((row) => (
          <li key={row.label} className="flex justify-between gap-2">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted-foreground">bis etwa {shortDay(row.until)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Nach dem typischen ersten Frost dieses Standorts ({shortDay(`${season}-${bed.firstFrost}`)}).</p>
    </Section>
  );
}
