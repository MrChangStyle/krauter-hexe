import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Leaf, Loader2 } from "lucide-react";
import { getFarmExport, getPastures, listHerds, listRations, useGetFarmFarming, type FarmFarming, type FarmSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { countText, deDate, exportCsv, exportFileName, exportForPeriod, hasBees } from "@/lib/farm-health";
import { FARMING_LABELS, certified } from "@/lib/farming-labels";
import { grazingRows, organicFeedRows, organicSpaceRows } from "@/lib/organic-check";
import { todayIso } from "@/lib/farm-labels";

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The status line of the Bio-Dokumentation. */
function organicStatus(f: FarmFarming): string {
  return [FARMING_LABELS[f.level], f.controlBody ? `Kontrollstelle ${f.controlBody}` : null, f.organicSince ? `seit ${deDate(f.organicSince)}` : null].filter(Boolean).join(" · ");
}

/** "Veterinäramt-Export": stock list and health history as CSV or PDF. */
export function FarmExportCard({ farm }: { farm: FarmSummary }) {
  const { toast } = useToast();
  const today = todayIso();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<"csv" | "pdf" | "bio" | null>(null);
  const farming = useGetFarmFarming(farm.id);
  const organic = certified(farming.data?.level);
  const invalid = !from || !to || from > to;

  async function run(kind: "csv" | "pdf" | "bio") {
    setBusy(kind);
    try {
      const data = exportForPeriod(await getFarmExport(farm.id), { from, to });
      if (kind === "csv") {
        download(exportCsv(data), exportFileName(data, "csv"), "text/csv;charset=utf-8");
      } else if (kind === "pdf") {
        const { exportFarmPdf } = await import("@/lib/farm-export-pdf");
        await exportFarmPdf(data);
      } else {
        // A member without the feed or pasture module gets those parts empty.
        const [rations, herds, pastures] = await Promise.all([
          listRations(farm.id).catch(() => []),
          listHerds(farm.id).catch(() => []),
          getPastures(farm.id).then((o) => o.pastures).catch(() => []),
        ]);
        const { exportFarmPdf } = await import("@/lib/farm-export-pdf");
        await exportFarmPdf(data, {
          status: organicStatus(farming.data!),
          feedRows: organicFeedRows(rations),
          spaceRows: organicSpaceRows(herds),
          grazingRows: grazingRows(pastures, { from, to }, deDate),
        });
      }
      toast({
        title: "Export erstellt",
        description:
          `${countText(data.animals.length, "Tier", "Tiere")}, ${countText(data.records.length, "Eintrag", "Einträge")} in der Medizin-Historie` +
          (hasBees(data) ? `, ${countText(data.beeColonies.length, "Bienenvolk", "Bienenvölker")} mit ${countText(data.beeTreatments.length, "Behandlung", "Behandlungen")}.` : "."),
      });
    } catch {
      toast({ title: "Export fehlgeschlagen", description: "Bitte versuche es noch einmal.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <FileDown className="h-4 w-4 text-primary" />
          Veterinäramt-Export
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bestandsliste und Medizin-Historie für einen Zeitraum – mit Bienen auch die Völker und das Bestandsbuch ihrer Behandlungen. Als PDF zum Ausdrucken oder CSV für Excel.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-from">Von</Label>
          <Input id="export-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-to">Bis</Label>
          <Input id="export-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1 gap-1.5" disabled={invalid || busy !== null} onClick={() => void run("pdf")}>
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          PDF
        </Button>
        <Button variant="outline" className="flex-1 gap-1.5" disabled={invalid || busy !== null} onClick={() => void run("csv")}>
          {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          CSV
        </Button>
      </div>
      {organic && (
        <div className="space-y-1.5 border-t pt-3">
          <Button variant="secondary" className="w-full gap-1.5" disabled={invalid || busy !== null} onClick={() => void run("bio")} data-testid="organic-doc">
            {busy === "bio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Leaf className="h-4 w-4" />}
            Bio-Dokumentation (PDF)
          </Button>
          <p className="text-xs text-muted-foreground">Für die Öko-Kontrolle: Bestand, Behandlungen mit Bio-Wartezeit, Fütterung mit Bio-Anteilen, Stall und Auslauf, Weidegang.</p>
        </div>
      )}
    </section>
  );
}
