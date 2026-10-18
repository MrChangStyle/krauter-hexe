import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { getFarmExport, type FarmSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { countText, exportCsv, exportFileName, exportForPeriod } from "@/lib/farm-health";
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

/** "Veterinäramt-Export": stock list and health history as CSV or PDF. */
export function FarmExportCard({ farm }: { farm: FarmSummary }) {
  const { toast } = useToast();
  const today = todayIso();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const invalid = !from || !to || from > to;

  async function run(kind: "csv" | "pdf") {
    setBusy(kind);
    try {
      const data = exportForPeriod(await getFarmExport(farm.id), { from, to });
      if (kind === "csv") {
        download(exportCsv(data), exportFileName(data, "csv"), "text/csv;charset=utf-8");
      } else {
        const { exportFarmPdf } = await import("@/lib/farm-export-pdf");
        await exportFarmPdf(data);
      }
      toast({
        title: "Export erstellt",
        description: `${countText(data.animals.length, "Tier", "Tiere")}, ${countText(data.records.length, "Eintrag", "Einträge")} in der Medizin-Historie.`,
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
          Bestandsliste und Medizin-Historie für einen Zeitraum – als PDF zum Ausdrucken oder CSV für Excel.
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
    </section>
  );
}
