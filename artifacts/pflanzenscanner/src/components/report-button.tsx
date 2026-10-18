import { useState, type ReactNode } from "react";
import { Flag, Loader2 } from "lucide-react";
import { useCreateReport, type ReportReason } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  unangemessen: "Anstößig oder beleidigend",
  person: "Zeigt eine Person",
  falsch: "Falsches Foto (passt nicht zur Art)",
  urheberrecht: "Fremdes Foto / Urheberrecht",
  spam: "Werbung oder Spam",
  sonstiges: "Sonstiges",
};

/** Reasons that make sense per content type (a username shows no person). */
const REASONS: Record<"image" | "username", ReportReason[]> = {
  image: ["unangemessen", "person", "falsch", "urheberrecht", "spam", "sonstiges"],
  username: ["unangemessen", "spam", "sonstiges"],
};

/**
 * "Melden" for public content: the shared photo of an archive entry or a
 * username in the leaderboard. The owner sees nothing here – they act on
 * content directly in the moderation list.
 */
export function ReportButton({
  contentType,
  contentId,
  what,
  variant = "text",
  className,
}: {
  contentType: "plant_image" | "insect_image" | "username";
  contentId: string | number;
  /** Shown in the dialog, e.g. "das Foto von Brennnessel". */
  what: ReactNode;
  /** "text": small link with label; "icon": flag only (for tight rows). */
  variant?: "text" | "icon";
  className?: string;
}) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const report = useCreateReport({
    mutation: {
      onSuccess() {
        setOpen(false);
        toast({
          title: "Danke für deine Meldung",
          description: "Wir schauen uns das an.",
        });
      },
      onError(err) {
        const data = (err as { data?: { error?: string } } | null)?.data;
        setError(data?.error ?? "Die Meldung konnte nicht gesendet werden.");
      },
    },
  });

  if (!user || user.isOwner) return null;

  const reasons = REASONS[contentType === "username" ? "username" : "image"];

  function openDialog() {
    setReason("");
    setNote("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (!reason) {
      setError("Bitte wähle einen Grund.");
      return;
    }
    setError(null);
    report.mutate({
      data: {
        contentType,
        contentId: String(contentId),
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Melden"
        title="Melden"
        className={cn(
          "inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-destructive",
          variant === "icon" ? "p-1" : "px-1.5 py-1",
          className,
        )}
      >
        <Flag className="h-3.5 w-3.5" />
        {variant === "text" && "Melden"}
      </button>

      <Dialog open={open} onOpenChange={(next) => !report.isPending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inhalt melden</DialogTitle>
            <DialogDescription>
              Du meldest {what}. Was stimmt damit nicht?
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={reason}
            onValueChange={(value) => setReason(value as ReportReason)}
            className="gap-2.5"
          >
            {reasons.map((r) => (
              <div key={r} className="flex items-center gap-2.5">
                <RadioGroupItem value={r} id={`report-${r}`} />
                <Label htmlFor={`report-${r}`} className="font-normal">
                  {REPORT_REASON_LABELS[r]}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-note" className="text-xs text-muted-foreground">
              Anmerkung (optional)
            </Label>
            <Textarea
              id="report-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={report.isPending}>
              Abbrechen
            </Button>
            <Button onClick={submit} disabled={report.isPending} className="gap-2">
              {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Melden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
