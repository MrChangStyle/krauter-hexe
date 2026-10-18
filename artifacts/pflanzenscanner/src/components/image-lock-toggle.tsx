import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { setInsectImageLock, setPlantImageLock } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin only: lock the shared photo so a better rated scan never replaces it.
 * Renders nothing for everyone else.
 */
export function ImageLockToggle({
  kind,
  id,
  locked,
  quality,
}: {
  kind: "plant" | "insect";
  id: number;
  locked: boolean;
  quality: number | null | undefined;
}) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user?.isOwner) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (kind === "plant") await setPlantImageLock(id, { locked: !locked });
      else await setInsectImageLock(id, { locked: !locked });
      await queryClient.invalidateQueries({
        queryKey: [kind === "plant" ? "/api/plants" : "/api/insects"],
      });
      toast({ title: !locked ? "Bild gesperrt" : "Bild freigegeben" });
    } catch {
      toast({ title: "Das hat nicht geklappt", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span>
        Admin · Bildqualität {quality != null ? `${quality}/10` : "nicht bewertet"}
        {locked ? " · gesperrt" : ""}
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle()}>
        {locked ? (
          <>
            <LockOpen className="w-3.5 h-3.5 mr-1" /> Freigeben
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 mr-1" /> Bild sperren
          </>
        )}
      </Button>
    </div>
  );
}
