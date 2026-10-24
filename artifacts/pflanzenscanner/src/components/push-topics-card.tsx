import { useQueryClient } from "@tanstack/react-query";
import { getGetSettingsQueryKey, useSetSettings, type PushTopic, type UserSettingsInput } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useModules } from "@/hooks/use-modules";
import { useAuthContext } from "@/lib/auth-context";
import { GROW_ENABLED } from "@/lib/grow-labels";
import { DEFAULT_QUIET, PUSH_TOPICS } from "@/lib/push-topics";

/** Which pushes come, and a quiet time without them (per account, docs/benachrichtigungen.md). */
export function PushTopicsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthContext();
  const { settings, visible } = useModules();
  const save = useSetSettings({
    mutation: {
      onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data),
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  if (!settings.data) return null;
  const { pushOff, quietHours } = settings.data;
  const isOwner = !!(user as { isOwner?: boolean } | null)?.isOwner;
  const topics = PUSH_TOPICS.filter((t) => (t.ownerOnly ? isOwner : !t.module || visible(t.module)) && (t.topic !== "grow" || GROW_ENABLED));
  const put = (data: UserSettingsInput) => save.mutate({ data });
  const flip = (topic: PushTopic) => put({ pushOff: pushOff.includes(topic) ? pushOff.filter((t) => t !== topic) : [...pushOff, topic] });
  const time = (field: "from" | "to", value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value) || !quietHours) return;
    const next = { ...quietHours, [field]: value };
    if (next.from !== next.to) put({ quietHours: next });
  };

  return (
    <div className="mt-4 space-y-3 border-t pt-3" data-testid="push-topics">
      <p className="text-sm font-semibold">Was möchtest du bekommen?</p>
      <ul className="divide-y rounded-xl border">
        {topics.map((t) => (
          <li key={t.topic} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted-foreground">{t.hint}</span>
            </span>
            <Switch checked={!pushOff.includes(t.topic)} disabled={save.isPending} aria-label={`${t.label} benachrichtigen`} onCheckedChange={() => flip(t.topic)} />
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-xl border p-3">
        <label className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Ruhezeit</span>
            <span className="block text-xs text-muted-foreground">Keine Benachrichtigungen in dieser Zeit – außer Raubtier-Alarm.</span>
          </span>
          <Switch
            checked={!!quietHours}
            disabled={save.isPending}
            aria-label="Ruhezeit"
            onCheckedChange={(on) => put({ quietHours: on ? { ...DEFAULT_QUIET } : null })}
          />
        </label>
        {quietHours && (
          <div className="flex items-center gap-2 text-sm">
            <span>von</span>
            <Input type="time" aria-label="Ruhezeit von" className="h-9 w-32" defaultValue={quietHours.from} onBlur={(e) => time("from", e.target.value)} />
            <span>bis</span>
            <Input type="time" aria-label="Ruhezeit bis" className="h-9 w-32" defaultValue={quietHours.to} onBlur={(e) => time("to", e.target.value)} />
          </div>
        )}
        {quietHours && <p className="text-xs text-muted-foreground">Erinnerungen, die in die Ruhezeit fallen, entfallen. Lege Uhrzeiten für Aufgaben am besten außerhalb.</p>}
      </div>
    </div>
  );
}
