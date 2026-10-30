import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2 } from "lucide-react";
import { useSetPlantEdibleRelease, type Plant } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/auth-context";

/**
 * Freigabe durch den Betreiber (docs/scannen.md): only the app owner sees it,
 * only on mushrooms. After checking the photos, the owner releases a mushroom
 * as edible – or takes the release back. A later scan never changes it.
 */
export function MushroomReleaseCard({ plant }: { plant: Plant }) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const save = useSetPlantEdibleRelease({
    mutation: {
      onSuccess(_data, { data }) {
        void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
        toast({ title: data.released ? "Als essbar freigegeben" : "Freigabe zurückgenommen" });
        setConfirm(null);
      },
      onError: () => toast({ title: "Das hat nicht geklappt.", variant: "destructive" }),
    },
  });
  if (!user?.isOwner || plant.category !== "mushroom") return null;
  const edible = plant.humanStatus === "edible";
  const released = !!plant.edibleReleasedAt;

  return (
    <section className="space-y-2 rounded-2xl border border-dashed border-border p-4 text-sm" data-testid="mushroom-release">
      <p className="flex items-center gap-2 font-medium">
        <BadgeCheck className="h-4 w-4 text-primary" />
        Freigabe durch den Betreiber
      </p>
      <p className="text-xs text-muted-foreground">
        {released
          ? `Von dir am ${new Date(plant.edibleReleasedAt!).toLocaleDateString("de-DE")} ${edible ? "als essbar freigegeben" : "zurückgenommen"}. Spätere Scans ändern das nicht.`
          : "Nur für dich sichtbar. Wenn du die Fotos geprüft hast und die Art sicher ist, kannst du den Pilz als essbar freigeben – für alle in der App."}
      </p>
      <Button size="sm" variant={edible ? "outline" : "default"} onClick={() => setConfirm(!edible)}>
        {edible ? "Freigabe zurücknehmen" : "Als essbar freigeben"}
      </Button>
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !save.isPending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm ? `„${plant.germanName}“ als essbar freigeben?` : "Freigabe zurücknehmen?"}</DialogTitle>
            <DialogDescription>
              {confirm
                ? "Alle in der App sehen den Pilz dann als essbar, mit dem Hinweis, dass du ihn anhand der Fotos geprüft hast. Nur freigeben, wenn die Art zweifelsfrei ist und keine Verwechslung mit giftigen Doppelgängern möglich ist."
                : "Der Pilz gilt dann wieder als nicht essbar."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={save.isPending} onClick={() => setConfirm(null)}>
              Abbrechen
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate({ id: plant.id, data: { released: !!confirm } })}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {confirm ? "Freigeben" : "Zurücknehmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
