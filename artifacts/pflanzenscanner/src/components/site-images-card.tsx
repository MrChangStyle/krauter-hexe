import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { getListSiteImageSlotsQueryKey, useDeleteSiteImage, useGenerateSiteImage, useListSiteImageSlots, type SiteImageSlot } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function errorText(err: unknown): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? "Bitte versuche es gleich noch einmal.";
}

function Slot({ s, busy, onGenerate, onDelete }: { s: SiteImageSlot; busy: boolean; onGenerate: (extra: string) => void; onDelete: () => void }) {
  const [extra, setExtra] = useState("");
  return (
    <li className="space-y-2 rounded-xl border p-3" data-testid={`site-image-${s.slot}`}>
      <div className="flex items-start gap-3">
        {s.url ? (
          <img src={s.url} alt={s.title} className="h-16 w-24 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">noch kein Bild</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{s.title}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{s.prompt}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 min-w-[10rem] flex-1" maxLength={300} value={extra} placeholder="Zusatz, z. B. „im Herbst“" onChange={(e) => setExtra(e.target.value)} />
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => onGenerate(extra)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {s.url ? "Neu erzeugen" : "Erzeugen"}
        </Button>
        {s.url && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Entfernen
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Verwaltung → Homepage-Bilder (docs/landingpage.md): the owner lets the
 * image AI make the realistic pictures of the homepage, slot by slot.
 */
export function SiteImagesCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const slots = useListSiteImageSlots();
  const [busy, setBusy] = useState<string | null>(null);
  const saved = {
    onSuccess(next: SiteImageSlot[]) {
      queryClient.setQueryData(getListSiteImageSlotsQueryKey(), next);
    },
    onError: (err: unknown) => toast({ title: "Kein Bild", description: errorText(err), variant: "destructive" }),
    onSettled: () => setBusy(null),
  };
  const generate = useGenerateSiteImage({ mutation: saved });
  const remove = useDeleteSiteImage({ mutation: saved });
  const list = slots.data ?? [];
  const done = list.filter((s) => s.url).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Homepage-Bilder</CardTitle>
        <CardDescription>
          Realistische Bilder für die öffentliche Homepage, erzeugt mit der Bild-KI von Google. Ein Bild dauert etwa 10–30 Sekunden und kostet bei Google eine Bild-Anfrage. Bis ein Platz ein Bild hat, zeigt die Homepage eine Zeichnung. Auf der Seite stehen sie mit „KI-generiertes Bild“.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <>
            <p className="flex items-center justify-between text-sm">
              <span>
                {done} von {list.length} Plätzen haben ein Bild
              </span>
              <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">
                Homepage
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
            <ul className="space-y-2">
              {list.map((s) => (
                <Slot
                  key={s.slot}
                  s={s}
                  busy={busy !== null}
                  onGenerate={(extra) => {
                    setBusy(s.slot);
                    generate.mutate({ slot: s.slot, data: { extra: extra.trim() || null } });
                  }}
                  onDelete={() => {
                    if (!window.confirm(`Das Bild „${s.title}“ entfernen?`)) return;
                    setBusy(s.slot);
                    remove.mutate({ slot: s.slot });
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
