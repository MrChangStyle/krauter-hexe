import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getListFarmMembersQueryKey, useSetFarmMemberModules, type FarmMember, type ModuleId } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { FARM_ROLE_LABELS } from "@/lib/active-farm";
import { FARM_MODULE_IDS, MODULES } from "@/lib/modules";

/** Modul-Freigaben (docs/team.md): which farm modules one member may use. Admins only. */
export function MemberModulesDialog({ farmId, member, onClose }: { farmId: number; member: FarmMember; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // null = all modules.
  const [draft, setDraft] = useState<ModuleId[] | null>(member.modules ?? null);
  const save = useSetFarmMemberModules({
    mutation: {
      onSuccess(list) {
        queryClient.setQueryData(getListFarmMembersQueryKey(farmId), list);
        onClose();
      },
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const all = draft === null;
  const has = (id: ModuleId) => all || draft!.includes(id);
  const flip = (id: ModuleId) => {
    const current = draft ?? [...FARM_MODULE_IDS];
    setDraft(current.includes(id) ? current.filter((m) => m !== id) : FARM_MODULE_IDS.filter((m) => m === id || current.includes(m)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Freigaben für {member.displayName}</DialogTitle>
          <DialogDescription>
            Welche Module {member.displayName} auf dieser Farm sieht. Was {member.displayName} darin darf, bestimmt die Rolle ({FARM_ROLE_LABELS[member.role]}). Tiere und wichtige Kontakte sieht jedes Mitglied.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <span className="flex-1 text-sm font-semibold">Alle Module</span>
          <Switch checked={all} aria-label="Alle Module freigeben" onCheckedChange={(on) => setDraft(on ? null : [...FARM_MODULE_IDS])} />
        </label>
        <ul className="divide-y rounded-xl border" data-testid="member-modules">
          {FARM_MODULE_IDS.map((id) => {
            const def = MODULES.find((m) => m.id === id)!;
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{def.label}</span>
                  <span className="block text-xs text-muted-foreground">{def.hint}</span>
                </span>
                <Switch checked={has(id)} aria-label={`${def.label} freigeben`} onCheckedChange={() => flip(id)} />
              </li>
            );
          })}
        </ul>
        <Button disabled={save.isPending} onClick={() => save.mutate({ farmId, userId: member.userId, data: { modules: draft } })}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Speichern
        </Button>
      </DialogContent>
    </Dialog>
  );
}
