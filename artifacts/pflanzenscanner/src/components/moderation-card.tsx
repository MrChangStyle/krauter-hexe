import { useState } from "react";
import { Ban, Check, Flag, ImageOff, Loader2, UserX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListReportsQueryKey,
  useListReports,
  useResolveReports,
  type ReportGroup,
  type ResolveReportsInputAction,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { REPORT_REASON_LABELS } from "@/components/report-button";

const TYPE_LABELS: Record<ReportGroup["contentType"], string> = {
  plant_image: "Pflanzenfoto",
  insect_image: "Insektenfoto",
  username: "Benutzername",
};

interface ActionSpec {
  action: ResolveReportsInputAction;
  label: string;
  icon: typeof Check;
  /** Text for the confirmation dialog; undefined = no confirmation needed. */
  confirm?: string;
}

/** The actions that fit a report group, in display order. */
export function actionsFor(group: ReportGroup): ActionSpec[] {
  const dismiss: ActionSpec = { action: "dismiss", label: "Verwerfen", icon: Check };
  if (!group.exists) return [{ ...dismiss, label: "Erledigt" }];
  if (group.contentType === "username") {
    return [
      dismiss,
      {
        action: "reset_username",
        label: "Name zurücksetzen",
        icon: UserX,
        confirm: `Der Name „${group.label}“ wird entfernt. Das Konto muss sich einen neuen Namen aussuchen.`,
      },
      {
        action: "block_user",
        label: "Konto sperren",
        icon: Ban,
        confirm: `Das Konto mit dem Namen „${group.label}“ wird gesperrt und sein Name entfernt. Du kannst es in der Benutzerverwaltung wieder freischalten.`,
      },
    ];
  }
  return [
    dismiss,
    {
      action: "remove_image",
      label: "Foto entfernen",
      icon: ImageOff,
      confirm: `Das gemeinsame Foto von „${group.label}“ wird gelöscht. Der Eintrag bleibt; der nächste Scan dieser Art liefert ein neues Foto.`,
    },
  ];
}

function ReportGroupRow({ group }: { group: ReportGroup }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ActionSpec | null>(null);

  const resolve = useResolveReports({
    mutation: {
      onSuccess() {
        toast({ title: "Erledigt" });
        void queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
        // A removed photo or name shows up everywhere else too.
        void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/insects"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      },
      onError(err) {
        const data = (err as { data?: { error?: string } } | null)?.data;
        toast({
          title: "Das hat nicht geklappt",
          description: data?.error,
          variant: "destructive",
        });
      },
    },
  });

  function run(spec: ActionSpec) {
    resolve.mutate({
      data: { contentType: group.contentType, contentId: group.contentId, action: spec.action },
    });
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const imageSrc = group.imageUrl?.startsWith("/") ? `${base}${group.imageUrl}` : group.imageUrl;

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex gap-3">
        {imageSrc && group.exists && (
          <img
            src={imageSrc}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {TYPE_LABELS[group.contentType]} · {group.reportCount}×{" "}
            gemeldet
          </p>
          <p className={group.contentType === "username" ? "font-mono font-semibold" : "font-semibold"}>
            {group.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {group.reasons
              .map((r) => `${REPORT_REASON_LABELS[r.reason]}${r.count > 1 ? ` (${r.count})` : ""}`)
              .join(" · ")}
          </p>
        </div>
      </div>
      {group.notes.length > 0 && (
        <ul className="space-y-1 text-xs italic text-muted-foreground">
          {group.notes.map((note, i) => (
            <li key={i}>„{note}“</li>
          ))}
        </ul>
      )}
      {!group.exists && (
        <p className="text-xs text-muted-foreground">Der Inhalt ist bereits nicht mehr sichtbar.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {actionsFor(group).map((spec) => (
          <Button
            key={spec.action}
            size="sm"
            variant="outline"
            className={spec.confirm ? "gap-1.5 text-destructive hover:text-destructive" : "gap-1.5"}
            disabled={resolve.isPending}
            onClick={() => (spec.confirm ? setPending(spec) : run(spec))}
          >
            {resolve.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <spec.icon className="h-3.5 w-3.5" />
            )}
            {spec.label}
          </Button>
        ))}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}?</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) run(pending);
                setPending(null);
              }}
            >
              {pending?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Owner: open reports on public content, one row per reported item. */
export function ModerationCard() {
  const reports = useListReports();
  const groups = reports.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Flag className="h-4 w-4 text-primary" />
        Meldungen
        {groups.length > 0 && (
          <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
            {groups.length}
          </span>
        )}
      </h2>
      {reports.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wird geladen …
        </p>
      ) : reports.isError ? (
        <p className="text-sm text-destructive">Die Meldungen konnten nicht geladen werden.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Meldungen.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <ReportGroupRow key={`${group.contentType}:${group.contentId}`} group={group} />
          ))}
        </ul>
      )}
    </section>
  );
}
