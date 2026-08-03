import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useSendTestPush } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  disablePush,
  enablePush,
  isPushEnabled,
  pushSupported,
} from "@/lib/push";

type Status = "loading" | "unsupported" | "denied" | "off" | "on";

// Unobtrusive Home-section card: shows an "activate notifications" hint when
// push is not enabled yet, and a test button once it is.
export function PushNotificationCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const testMutation = useSendTestPush();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const enabled = await isPushEnabled();
      if (!cancelled) setStatus(enabled ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading" || status === "unsupported") return null;

  const activate = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setStatus("on");
      toast({
        title: "Benachrichtigungen aktiviert",
        description:
          "Du bekommst jetzt Erinnerungen für Aufgaben und Pflege-Guides auf diesem Gerät.",
      });
    } else if (result.reason === "denied") {
      setStatus("denied");
    } else if (result.reason === "no-sw") {
      toast({
        title: "Nicht verfügbar",
        description:
          "Benachrichtigungen funktionieren nur in der installierten bzw. veröffentlichten App.",
      });
    } else {
      toast({
        title: "Aktivierung fehlgeschlagen",
        description: "Bitte versuche es später erneut.",
        variant: "destructive",
      });
    }
  };

  const deactivate = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setStatus("off");
    toast({ title: "Benachrichtigungen deaktiviert" });
  };

  const sendTest = () => {
    testMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: res.sent > 0 ? "Test gesendet" : "Kein Gerät erreicht",
          description:
            res.sent > 0
              ? `Test-Benachrichtigung an ${res.sent} Gerät${res.sent === 1 ? "" : "e"} gesendet.`
              : "Bitte aktiviere Benachrichtigungen zuerst auf diesem Gerät.",
        });
      },
      onError: () => {
        toast({
          title: "Test fehlgeschlagen",
          description: "Bitte versuche es später erneut.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {status === "on" ? (
          <BellRing className="w-4 h-4 text-primary" />
        ) : (
          <Bell className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">Benachrichtigungen</span>
      </div>

      {status === "denied" ? (
        <p className="text-xs text-muted-foreground">
          Benachrichtigungen sind im Browser blockiert. Erlaube sie in den
          Website-Einstellungen deines Browsers, um Erinnerungen zu erhalten.
        </p>
      ) : status === "off" ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Erhalte Erinnerungen auf diesem Gerät, wenn Aufgaben fällig sind
            oder dein Pflege-Guide Handlungsbedarf hat – auch bei geschlossener
            App.
          </p>
          <Button size="sm" onClick={activate} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 mr-1.5" />
            )}
            Benachrichtigungen aktivieren
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Aktiv: Du bekommst Erinnerungen für fällige Aufgaben und
            Pflege-Guides auf diesem Gerät.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={sendTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <BellRing className="w-4 h-4 mr-1.5" />
              )}
              Test-Benachrichtigung senden
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={deactivate}
              disabled={busy}
            >
              <BellOff className="w-4 h-4 mr-1.5" />
              Deaktivieren
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
