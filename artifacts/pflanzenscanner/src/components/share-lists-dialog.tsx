import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getListFarmMembersQueryKey,
  getListNoteSharesQueryKey,
  useAddFarmMember,
  useAddNoteShare,
  useListNoteShares,
  useSetFarmMemberModules,
  type FarmMember,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/components/hof-tasks";

// "Mit wem?": someone outside the team, by Nutzer-ID (docs/konto.md).
const BY_CODE = "code";

/**
 * Share the Hof-Aufgaben, the own Alltagsnotizen, or both (docs/alltagsnotizen.md):
 * with someone from the team or anyone with an account (e-mail), e.g. family.
 * Who it is shared with ticks off and adds; only the owner deletes.
 *
 * Hof-Aufgaben = the farm's list: the person joins the team as Mitarbeiter
 * with the Freigabe "Hof- & Stall-Aufgaben" (admins only). Alltagsnotizen =
 * the own list (everyone).
 */
export function ShareListsDialog({
  farm,
  team,
  initial,
  onClose,
}: {
  farm: FarmSummary | null;
  /** The farm's members (without guests), from useTeam. */
  team: FarmMember[];
  initial: { hof: boolean; notes: boolean };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = farm?.role === "admin";
  const others = team.filter((m) => !m.isMe);
  const [who, setWho] = useState<string>(others[0]?.userId ?? BY_CODE);
  const [code, setCode] = useState("");
  const [hof, setHof] = useState(initial.hof && isAdmin);
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shares = useListNoteShares();
  const addShare = useAddNoteShare();
  const addMember = useAddFarmMember();
  const setModules = useSetFarmMemberModules();

  async function shareHof(): Promise<void> {
    if (!farm) return;
    if (who === BY_CODE) {
      const list = await addMember.mutateAsync({ farmId: farm.id, data: { userCode: Number(code), role: "caretaker" } });
      const added = list.find((m) => m.userCode === Number(code));
      // A new person sees only the Hof-Aufgaben – more under Farm & Team.
      if (added && added.role !== "admin") await setModules.mutateAsync({ farmId: farm.id, userId: added.userId, data: { modules: ["farm-tasks"] } });
    } else {
      const member = team.find((m) => m.userId === who);
      if (member && member.modules && !member.modules.includes("farm-tasks")) {
        await setModules.mutateAsync({ farmId: farm.id, userId: member.userId, data: { modules: [...member.modules, "farm-tasks"] } });
      }
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hof && !notes) return setError("Bitte wähle mindestens eine Liste.");
    if (who === BY_CODE && !/^\d{4,7}$/.test(code)) return setError("Bitte gib die Nutzer-ID an – eine Zahl mit mindestens vier Stellen.");
    setBusy(true);
    try {
      if (hof) await shareHof();
      if (notes) await addShare.mutateAsync({ data: who === BY_CODE ? { userCode: Number(code) } : { userId: who } });
      void queryClient.invalidateQueries({ queryKey: getListNoteSharesQueryKey() });
      if (farm) void queryClient.invalidateQueries({ queryKey: getListFarmMembersQueryKey(farm.id) });
      toast({ title: "Geteilt", description: [hof && "Hof-Aufgaben", notes && "Alltagsnotizen"].filter(Boolean).join(" und ") + " – abhaken und hinzufügen ja, löschen nein." });
      onClose();
    } catch (err) {
      setError(errorText(err, "Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  const sharedNames = (shares.data?.sharedWith ?? []).map((p) => p.name);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Listen teilen</DialogTitle>
            <DialogDescription>
              Wer mitmacht, kann abhaken und Neues hinzufügen, aber nichts löschen. Löschen kann nur der Besitzer der Liste.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-who">Mit wem?</Label>
            <select id="share-who" value={who} onChange={(e) => setWho(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              {others.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName}</option>
              ))}
              <option value={BY_CODE}>Andere Person per Nutzer-ID …</option>
            </select>
            {who === BY_CODE && (
              <Input
                aria-label="Nutzer-ID"
                inputMode="numeric"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="z. B. 4821"
                autoComplete="off"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Die Person braucht ein eigenes Konto in der App – zum Beispiel jemand aus der Familie. Ihre Nutzer-ID steht bei ihr unter Mehr → Konto.
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Was teilen?</legend>
            <label className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${isAdmin ? "" : "opacity-60"}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={hof} disabled={!isAdmin} onChange={(e) => setHof(e.target.checked)} />
              <span>
                <span className="block font-medium">Hof-Aufgaben</span>
                <span className="block text-xs text-muted-foreground">
                  {isAdmin
                    ? "Die gemeinsame Liste des Hofs. Neue Personen kommen als Mitarbeiter ins Team und sehen nur die Hof-Aufgaben (und die Tiere)."
                    : "Nur ein Admin des Hofs kann die Hof-Aufgaben teilen."}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 rounded-xl border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
              <span>
                <span className="block font-medium">Meine Alltagsnotizen</span>
                <span className="block text-xs text-muted-foreground">
                  Deine Einkaufsliste und was du dir merkst.{sharedNames.length > 0 ? ` Schon geteilt mit: ${sharedNames.join(", ")}.` : ""}
                </span>
              </span>
            </label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Teilen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
