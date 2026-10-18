import { useState } from "react";
import { Camera, Pin } from "lucide-react";
import { MeinBeetTab, MyScansTab, TabButton } from "@/pages/mehr";
import { useFavorites } from "@/lib/use-favorites";
import { BackToPflanzen } from "@/components/back-to-pflanzen";

/** Meine Pflanzen: the user's scans and their bed (Mein Beet). */
export default function MeinePflanzenPage() {
  const favorites = useFavorites();
  const [tab, setTab] = useState<"scans" | "beet">("scans");

  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <BackToPflanzen />
      <div>
        <h1 className="text-2xl font-bold">Meine Pflanzen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deine gescannten Pflanzen und dein Beet.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1 bg-muted rounded-xl p-1">
        <TabButton active={tab === "scans"} onClick={() => setTab("scans")} icon={Camera} label="Scans" />
        <TabButton active={tab === "beet"} onClick={() => setTab("beet")} icon={Pin} label="Beet" />
      </div>
      {tab === "scans" ? <MyScansTab favorites={favorites} /> : <MeinBeetTab favorites={favorites} />}
    </div>
  );
}
