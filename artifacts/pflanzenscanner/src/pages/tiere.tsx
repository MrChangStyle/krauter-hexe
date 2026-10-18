import { ClipboardList, HeartPulse, PawPrint, Wheat } from "lucide-react";

/** Placeholder for the animal module until it is built. */
export default function TierePage() {
  const items = [
    { icon: PawPrint, label: "Tierkarten", hint: "Foto, Rasse, Geburtsdatum, Nachwuchs" },
    { icon: HeartPulse, label: "Krankenakte", hint: "Behandlungen, Medikamente, Tierarzt" },
    { icon: ClipboardList, label: "Bestandsbuch", hint: "Kostenlos für alle Tierhalter" },
    { icon: Wheat, label: "Futterplaner", hint: "Etiketten prüfen, saisonale Tipps" },
  ];
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tiere</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Der Baustein Tiere ist in Arbeit. Das kommt hier hin:
        </p>
      </div>
      <div className="space-y-3">
        {items.map(({ icon: Icon, label, hint }) => (
          <div key={label} className="rounded-2xl border-2 border-dashed p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
