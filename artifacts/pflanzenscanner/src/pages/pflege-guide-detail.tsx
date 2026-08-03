import { useCallback, useEffect, useRef, useState } from "react";
import { isPushEnabled } from "@/lib/push";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetCareGuide,
  useUploadDay30Photo,
  useCreateTask,
  useDeleteCareGuide,
  useUpdateCareGuide,
  getListCareGuidesQueryKey,
} from "@workspace/api-client-react";
import type { CareGuide, CareGuideDailyEntry } from "@workspace/api-client-react";
import { TaskActionType, TaskIntervalUnit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { downscaleFile } from "@/lib/image";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Scissors,
  RefreshCcw,
  Sprout,
  Sparkles,
  Camera,
  CheckCircle2,
  Clock,
  Thermometer,
  ClipboardList,
  FlaskConical,
  Loader2,
  Flower2,
  AlertTriangle,
  PackageOpen,
  Trash2,
  Check,
  Bell,
  BellOff,
} from "lucide-react";
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
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayElapsed(guide: CareGuide): number {
  return Math.min(30, Math.max(0, differenceInDays(new Date(), new Date(guide.startDate)) + 1));
}

function actionIcons(entry: CareGuideDailyEntry) {
  const icons: { icon: React.ReactNode; label: string; color: string }[] = [];
  if (entry.umtopfen) icons.push({ icon: <PackageOpen className="w-3.5 h-3.5" />, label: "Umtopfen", color: "text-violet-600" });
  if (entry.giessen) icons.push({ icon: <Droplets className="w-3.5 h-3.5" />, label: "Gießen", color: "text-sky-500" });
  if (entry.bespruehen) icons.push({ icon: <Wind className="w-3.5 h-3.5" />, label: "Besprühen", color: "text-teal-500" });
  if (entry.beschneiden) icons.push({ icon: <Scissors className="w-3.5 h-3.5" />, label: "Beschneiden", color: "text-orange-500" });
  if (entry.drehen) icons.push({ icon: <RefreshCcw className="w-3.5 h-3.5" />, label: "Drehen", color: "text-amber-500" });
  if (entry.duengen) icons.push({ icon: <Sprout className="w-3.5 h-3.5" />, label: "Düngen", color: "text-emerald-600" });
  return icons;
}

function hasActions(entry: CareGuideDailyEntry): boolean {
  return !!(entry.giessen || entry.bespruehen || entry.beschneiden || entry.drehen || entry.duengen || entry.umtopfen);
}

function apiBaseUrl(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

// ─── Notification scheduler ───────────────────────────────────────────────────

function useReminderScheduler(guide: CareGuide | undefined) {
  const lastNotifiedKey = guide ? `care-guide-notified-${guide.id}` : null;

  useEffect(() => {
    if (!guide || !guide.reminderEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    // When server push is active on this device, the server already sends
    // these reminders - skip the local fallback to avoid duplicates.
    let pushActive = false;
    void isPushEnabled().then((enabled) => {
      pushActive = enabled;
    });

    const check = () => {
      if (pushActive) return;
      const now = new Date();
      const [hh, mm] = guide.reminderTime.split(":").map(Number);
      if (now.getHours() !== hh || now.getMinutes() !== mm) return;

      const todayKey = format(now, "yyyy-MM-dd");
      if (localStorage.getItem(lastNotifiedKey!) === todayKey) return;

      const elapsed = dayElapsed(guide);
      if (elapsed < 1 || elapsed > 30) return;

      const plan = guide.dailyPlan as CareGuideDailyEntry[];
      const todayEntry = plan.find((e) => e.day === elapsed);
      if (!todayEntry || !hasActions(todayEntry)) return;

      // Don't remind if already marked as done today
      if (guide.completedDays.includes(elapsed)) return;

      const actions: string[] = [];
      if (todayEntry.umtopfen) actions.push("Umtopfen");
      if (todayEntry.giessen) actions.push("Gießen");
      if (todayEntry.bespruehen) actions.push("Besprühen");
      if (todayEntry.beschneiden) actions.push("Beschneiden");
      if (todayEntry.drehen) actions.push("Drehen");
      if (todayEntry.duengen) actions.push("Düngen");

      const actionText = actions.join(" & ");
      new Notification(`🌿 Pflege-Guide: ${guide.plantName}`, {
        body: `Heute steht ${actionText} an!`,
        icon: `${apiBaseUrl()}/favicon.ico`,
        tag: `care-guide-${guide.id}`,
      });

      localStorage.setItem(lastNotifiedKey!, todayKey);
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [guide, lastNotifiedKey]);
}

// ─── Photo comparison component ───────────────────────────────────────────────

function VitalityCheck({
  guide,
  onPhotoUploaded,
}: {
  guide: CareGuide;
  onPhotoUploaded: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: upload, isPending } = useUploadDay30Photo({
    mutation: { onSuccess: onPhotoUploaded },
  });

  const elapsed = dayElapsed(guide);
  const isCompleted = guide.status === "Abgeschlossen";

  if (isCompleted && guide.hasImageDay30) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <p className="text-sm font-semibold">Vorher / Nachher</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {guide.hasImageDay1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tag 1</p>
              <img
                src={`${apiBaseUrl()}/api/care-guides/${guide.id}/image/day1`}
                alt="Tag 1"
                className="w-full aspect-square object-cover rounded-lg"
              />
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Tag 30</p>
            <img
              src={`${apiBaseUrl()}/api/care-guides/${guide.id}/image/day30`}
              alt="Tag 30"
              className="w-full aspect-square object-cover rounded-lg"
            />
          </div>
        </div>
      </div>
    );
  }

  if (elapsed >= 28 && !isCompleted) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Camera className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">Abschluss-Foto</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Du bist fast fertig! Mache ein Foto deiner Pflanze und schließe den Guide ab.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // downscaleFile returns a data-URL string directly
            const dataUrl = await downscaleFile(file, 1600);
            upload({ id: guide.id, data: { imageDay30: dataUrl } });
          }}
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          {isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Wird gespeichert…</>
          ) : (
            <><Camera className="w-4 h-4 mr-2" /> Foto aufnehmen & abschließen</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <Clock className="w-4 h-4 shrink-0" />
      <p className="text-xs">
        Das Abschluss-Foto wird ab Tag 28 freigeschaltet (noch {Math.max(0, 28 - elapsed)} Tage).
      </p>
    </div>
  );
}

// ─── Aufgaben import ──────────────────────────────────────────────────────────

function ImportToAufgaben({
  guide,
  plantId,
}: {
  guide: CareGuide;
  plantId: number | null;
}) {
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const { mutateAsync: createTask } = useCreateTask();

  const plan = guide.dailyPlan as CareGuideDailyEntry[];

  const handleImport = async () => {
    setImporting(true);
    try {
      const tasks: Promise<unknown>[] = [];
      const addTask = (actionType: TaskActionType, intervalValue: number) => {
        if (plantId == null) return; // tasks require a linked plant
        tasks.push(
          createTask({
            data: {
              plantId,
              actionType,
              intervalValue,
              intervalUnit: TaskIntervalUnit.Tage,
              reminderTime: "09:00",
            },
          }),
        );
      };

      const giessen = plan.filter((e) => e.giessen);
      if (giessen.length >= 2) {
        const interval = giessen[1].day - giessen[0].day;
        addTask(TaskActionType.Gießen, interval > 0 ? interval : 2);
      }
      const duengen = plan.filter((e) => e.duengen);
      if (duengen.length >= 2) {
        const interval = duengen[1].day - duengen[0].day;
        addTask(TaskActionType.Düngen, interval > 0 ? interval : 7);
      }
      if (plan.some((e) => e.bespruehen)) addTask(TaskActionType.Besprühen, 3);
      if (plan.some((e) => e.drehen)) addTask(TaskActionType.Pflanze_drehen, 7);

      await Promise.all(tasks);
      setDone(true);
    } finally {
      setImporting(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 text-sm">
        <CheckCircle2 className="w-4 h-4" />
        Aufgaben wurden angelegt!
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Wandle den Pflegeplan in wiederkehrende Aufgaben mit automatischen Erinnerungen um.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={handleImport}
        disabled={importing}
      >
        {importing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Wird angelegt…</>
        ) : (
          <><ClipboardList className="w-4 h-4" /> Als Aufgaben anlegen</>
        )}
      </Button>
    </div>
  );
}

// ─── Reminder settings panel ─────────────────────────────────────────────────

function ReminderPanel({
  guide,
  onUpdate,
}: {
  guide: CareGuide;
  onUpdate: (updated: CareGuide) => void;
}) {
  const { mutate: updateGuide, isPending } = useUpdateCareGuide();
  const [requestingPermission, setRequestingPermission] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    if (enabled && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      setRequestingPermission(true);
      const perm = await Notification.requestPermission();
      setRequestingPermission(false);
      if (perm !== "granted") return;
    }
    updateGuide(
      { id: guide.id, data: { reminderEnabled: enabled } },
      { onSuccess: onUpdate },
    );
  };

  const handleTimeChange = (time: string) => {
    updateGuide(
      { id: guide.id, data: { reminderTime: time } },
      { onSuccess: onUpdate },
    );
  };

  const notificationsUnsupported = typeof Notification === "undefined";
  const permDenied =
    !notificationsUnsupported && Notification.permission === "denied";

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {guide.reminderEnabled
            ? <Bell className="w-4 h-4 text-primary" />
            : <BellOff className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium">Tägliche Erinnerungen</span>
        </div>
        {isPending || requestingPermission ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={guide.reminderEnabled}
            onCheckedChange={handleToggle}
            disabled={notificationsUnsupported || permDenied}
          />
        )}
      </div>

      {permDenied && (
        <p className="text-xs text-destructive">
          Browser-Benachrichtigungen sind blockiert. Bitte in den Website-Einstellungen aktivieren.
        </p>
      )}
      {notificationsUnsupported && (
        <p className="text-xs text-muted-foreground">
          Benachrichtigungen werden von diesem Browser nicht unterstützt.
        </p>
      )}

      {guide.reminderEnabled && !permDenied && !notificationsUnsupported && (
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <label className="text-xs text-muted-foreground shrink-0">Erinnern um</label>
          <input
            type="time"
            defaultValue={guide.reminderTime}
            className="text-sm border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            onBlur={(e) => {
              if (e.target.value && e.target.value !== guide.reminderTime) {
                handleTimeChange(e.target.value);
              }
            }}
          />
        </div>
      )}

      {guide.reminderEnabled && (
        <p className="text-xs text-muted-foreground">
          Nur an Tagen mit Pflegeaktionen. Ruhetage werden übersprungen.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PflegeGuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Single source of truth: the React Query cache.
  // Custom key keeps it consistent across every setQueryData call on this page.
  const GUIDE_QUERY_KEY = [`/api/care-guides/${id}`];

  const { data: guide, isLoading, refetch } = useGetCareGuide(
    Number(id),
    { query: { queryKey: GUIDE_QUERY_KEY } },
  );

  const { mutate: deleteGuide, isPending: isDeleting } = useDeleteCareGuide({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListCareGuidesQueryKey() });
        setLocation("/benutzer");
      },
    },
  });

  const { mutate: updateGuide } = useUpdateCareGuide();
  const { toast } = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListCareGuidesQueryKey() });
    void refetch();
  };

  // guide is already the display source — no separate localCompleted needed
  useReminderScheduler(guide);

  // Debounce ref: flush PATCH 600 ms after the last toggle.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaysRef = useRef<{ next: number[]; current: number[] } | null>(null);
  // Keep guide id in a ref so the unmount cleanup can read it without stale closure.
  const guideIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (guide) guideIdRef.current = guide.id;
  }, [guide?.id]);

  const flushToggle = useCallback((guideId: number) => {
    if (!pendingDaysRef.current) return;
    const { next, current } = pendingDaysRef.current;
    pendingDaysRef.current = null;
    updateGuide(
      { id: guideId, data: { completedDays: next } },
      {
        onSuccess: (updated) => {
          const resp = updated as CareGuide & { leavesEarned?: number };
          queryClient.setQueryData<CareGuide>(GUIDE_QUERY_KEY, updated);
          if (resp.leavesEarned && resp.leavesEarned > 0) {
            toast({
              title: `+${resp.leavesEarned} Blatt! 🌿`,
              description: `Tag abgehakt – weiter so, Pflanzenretter!`,
            });
          }
        },
        onError: () => {
          queryClient.setQueryData<CareGuide>(GUIDE_QUERY_KEY, (prev) =>
            prev ? { ...prev, completedDays: current } : prev,
          );
        },
      },
    );
  }, [updateGuide, queryClient, toast]);

  const handleToggleDay = (day: number) => {
    if (!guide) return;
    const current = pendingDaysRef.current?.next ?? guide.completedDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);

    // 1. Optimistic update immediately.
    queryClient.setQueryData<CareGuide>(GUIDE_QUERY_KEY, (prev) =>
      prev ? { ...prev, completedDays: next } : prev,
    );

    // 2. Accumulate; flush after 600 ms of silence.
    pendingDaysRef.current = { next, current: guide.completedDays };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flushToggle(guide.id), 600);
  };

  // Flush on unmount: cancel the pending timer and fire the PATCH immediately
  // so a navigate-away never drops a pending completed-day change.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const pending = pendingDaysRef.current;
      const gid = guideIdRef.current;
      if (!pending || gid == null) return;
      pendingDaysRef.current = null;
      // Fire-and-forget direct fetch — component is already unmounting so we
      // cannot use the React Query mutation, but the network request still completes.
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      void fetch(`${base}/api/care-guides/${gid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedDays: pending.next }),
        credentials: "include",
      });
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 px-6 text-center">
        <p className="text-muted-foreground">Pflege-Guide nicht gefunden.</p>
        <Button variant="outline" onClick={() => setLocation("/pflege-guides")}>Zurück</Button>
      </div>
    );
  }

  const elapsed = dayElapsed(guide);
  const completedDays = guide.completedDays;
  const completedCount = completedDays.length;
  const progressPct = Math.round((completedCount / 30) * 100);
  const isCompleted = guide.status === "Abgeschlossen";
  const plan = guide.dailyPlan as CareGuideDailyEntry[];

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-8">
      {/* Header */}
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setLocation("/pflege-guides")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Alle Guides
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Guide löschen"
          >
            <Trash2 className="w-4 h-4" />
            Löschen
          </button>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-serif font-semibold leading-tight">{guide.plantName}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(guide.startDate), "dd. MMM", { locale: de })} –{" "}
              {format(new Date(guide.endDate), "dd. MMM yyyy", { locale: de })}
            </p>
          </div>
          <Badge
            className={cn(
              "shrink-0 mt-1",
              isCompleted
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200"
                : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200",
            )}
            variant="outline"
          >
            {isCompleted ? "Abgeschlossen" : `Tag ${elapsed} / 30`}
          </Badge>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {guide.targetHumidity && (
            <span className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1">
              <Thermometer className="w-3.5 h-3.5 text-muted-foreground" />
              Luftfeuchtigkeit: {guide.targetHumidity}
            </span>
          )}
          {guide.plantId && (
            <button
              onClick={() => setLocation(`/pflanze/${guide.plantId}`)}
              className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1 hover:bg-muted/70 transition-colors"
            >
              <Sprout className="w-3.5 h-3.5 text-muted-foreground" />
              Zur Pflanze
            </button>
          )}
        </div>

        {/* Pot + Soil info cards */}
        {(guide.potSizeRecommendation || guide.recommendedSoilType) && (
          <div className="grid grid-cols-1 gap-3 mt-4">
            {guide.potSizeRecommendation && (() => {
              const needsRepot =
                guide.potSizeRecommendation!.toLowerCase().includes("umtopfen") ||
                guide.potSizeRecommendation!.toLowerCase().includes("zu klein");
              return (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  needsRepot
                    ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                    : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                }`}>
                  <div className={`shrink-0 mt-0.5 p-1.5 rounded-lg ${needsRepot ? "bg-amber-100 dark:bg-amber-900/50" : "bg-emerald-100 dark:bg-emerald-900/50"}`}>
                    {needsRepot
                      ? <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${needsRepot ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                      Topf & Umtopfen
                    </p>
                    <p className="text-sm text-foreground leading-snug">{guide.potSizeRecommendation}</p>
                    {guide.recommendedPotDiameter && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Empfohlener Mindest-Durchmesser: <strong>{guide.recommendedPotDiameter}</strong>
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {guide.recommendedSoilType && (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                  <Flower2 className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                    Empfohlene Erde
                  </p>
                  <p className="text-sm text-foreground leading-snug">{guide.recommendedSoilType}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 px-6 space-y-6">
        {/* Progress bar – based on completed days */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              {completedCount > 0
                ? `${completedCount} von 30 Tagen erledigt`
                : "Noch keine Tage abgehakt"}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isCompleted ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Reminder panel */}
        {!isCompleted && (
          <ReminderPanel
            guide={guide}
            onUpdate={(updated) => {
              void queryClient.setQueryData([`/api/care-guides/${id}`], updated);
            }}
          />
        )}

        {/* Vitality check */}
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-4 pb-5 px-4">
            <VitalityCheck guide={guide} onPhotoUploaded={invalidate} />
          </CardContent>
        </Card>

        {/* 30-day plan */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            30-Tage-Pflegeplan
          </p>
          <div className="space-y-2">
            {plan.map((entry) => {
              const icons = actionIcons(entry);
              const isDone = completedDays.includes(entry.day);
              const isToday = entry.day === elapsed;
              const isPast = entry.day < elapsed;
              const canCheck = entry.day <= elapsed && !isCompleted;

              return (
                <div
                  key={entry.day}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 transition-colors",
                    isDone
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/20"
                      : isToday
                        ? "border-primary/50 bg-primary/5"
                        : isPast
                          ? "border-border/60 bg-muted/30 opacity-60"
                          : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Day number bubble */}
                    <div
                      className={cn(
                        "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isToday
                            ? "bg-primary text-primary-foreground"
                            : isPast
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5" /> : entry.day}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isDone && (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                          Erledigt
                        </p>
                      )}
                      {icons.length > 0 ? (
                        <div className={cn("flex flex-wrap gap-1.5", isDone && "opacity-60")}>
                          {icons.map((ic) => (
                            <span
                              key={ic.label}
                              className={cn("inline-flex items-center gap-1 text-xs font-medium", isDone ? "text-muted-foreground" : ic.color)}
                            >
                              {ic.icon}
                              {ic.label}
                              {ic.label === "Düngen" && entry.duengerart && (
                                <span className="text-muted-foreground font-normal">
                                  ({entry.duengerart === "biologisch" ? (
                                    <><Sprout className="w-3 h-3 inline" /> Bio</>
                                  ) : (
                                    <><FlaskConical className="w-3 h-3 inline" /> Mineral</>
                                  )})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className={cn("text-xs italic", isDone ? "text-emerald-600/60" : "text-muted-foreground")}>
                          Ruhetag
                        </p>
                      )}
                      {entry.notizen && !isDone && (
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{entry.notizen}</p>
                      )}
                    </div>

                    {/* Check button */}
                    {canCheck && (
                      <button
                        onClick={() => handleToggleDay(entry.day)}
                        aria-label={isDone ? "Als unerledigt markieren" : "Als erledigt markieren"}
                        className={cn(
                          "shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all",
                          isDone
                            ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600"
                            : "border-border bg-background hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
                        )}
                      >
                        {isDone && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    {/* Completed marker for past guide */}
                    {isCompleted && isDone && (
                      <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Import to Aufgaben */}
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-4 pb-5 px-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">In Aufgaben übernehmen</p>
            </div>
            <ImportToAufgaben guide={guide} plantId={guide.plantId ?? null} />
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pflege-Guide löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du den Pflege-Guide für <strong>{guide.plantName}</strong> wirklich löschen?
              Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGuide({ id: guide.id })}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
