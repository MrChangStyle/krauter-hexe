import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, Mail } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/** Passwort vergessen, neu festlegen und ändern (docs/konto.md). */

export const MIN_PASSWORD_LENGTH = 8;

/** POST to the API; rejects with the server's German message. */
export async function postJson<T>(path: string, body: unknown, fetchFn: typeof fetch = fetch): Promise<T> {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchFn(`${base}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Das hat nicht geklappt. Bitte versuche es noch einmal.");
  return data;
}

/** The token from a reset link (`/passwort-neu?token=…`), or null. */
export function resetTokenFrom(search: string): string | null {
  const token = new URLSearchParams(search).get("token");
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}

/** Login screen, "Passwort vergessen?": asks for the address and says what happens next. */
export function ForgotPasswordForm({ initialEmail = "", onBack }: { initialEmail?: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | { mail: boolean }>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await postJson<{ mail: boolean }>("/auth/password-reset", { email: email.trim() }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-4 text-left" data-testid="forgot-sent">
        <p className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {sent.mail ? (
            <span>
              Wenn es zu <strong className="break-all">{email.trim()}</strong> ein Konto gibt, ist jetzt eine Mail mit einem
              Link unterwegs. Er gilt eine Stunde. Schau auch im Spam-Ordner nach.
            </span>
          ) : (
            <span>
              Der Betreiber ist informiert und schickt dir einen Link, mit dem du ein neues Passwort festlegst – meist per
              Messenger. Eilt es, schreib an{" "}
              <a className="underline underline-offset-4" href="mailto:info@littlefarming.de">
                info@littlefarming.de
              </a>
              .
            </span>
          )}
        </p>
        <Button type="button" variant="outline" onClick={onBack}>
          Zurück zur Anmeldung
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-4 text-left" data-testid="forgot-form">
      <p className="text-sm text-muted-foreground">
        Gib die E-Mail-Adresse deines Kontos ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegst.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">E-Mail</Label>
        <Input
          id="forgot-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@beispiel.de"
        />
      </div>
      <ErrorLine error={error} />
      <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Link anfordern
      </Button>
      <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

/** The page behind the link: checks it, asks for the new password, signs in. */
export function ResetPasswordForm({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [state, setState] = useState<"checking" | "valid" | "invalid">(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    postJson<{ valid: boolean }>("/auth/password-reset/check", { token })
      .then((r) => live && setState(r.valid ? "valid" : "invalid"))
      // Unknown (offline): let them try, the confirm call answers for sure.
      .catch(() => live && setState("valid"));
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
      return;
    }
    if (password !== repeat) {
      setError("Die beiden Passwörter sind nicht gleich.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/auth/password-reset/confirm", { token, password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (state === "checking") {
    return <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Link wird geprüft" />;
  }
  if (state === "invalid") {
    return (
      <div className="flex w-full max-w-xs flex-col gap-4" data-testid="reset-invalid">
        <ErrorLine error="Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere bitte einen neuen an." />
        <Button type="button" onClick={onDone}>
          Zur Anmeldung
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-4 text-left" data-testid="reset-form">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password">Neues Passwort</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mindestens 8 Zeichen"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-repeat">Noch einmal</Label>
        <Input
          id="reset-repeat"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">Danach bist du angemeldet. Alle anderen Geräte werden abgemeldet.</p>
      <ErrorLine error={error} />
      <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Passwort speichern
      </Button>
    </form>
  );
}

/** "Dein Konto": change the password (Google-only accounts set their first one). */
export function ChangePasswordButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: boolean) {
    if (busy) return;
    setOpen(value);
    setCurrent("");
    setNext("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/auth/password", { currentPassword: current || undefined, newPassword: next });
      setBusy(false);
      toggle(false);
      toast({ title: "Passwort geändert", description: "Andere Geräte sind jetzt abgemeldet." });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={toggle}>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => toggle(true)}>
        <KeyRound className="h-4 w-4" />
        Passwort ändern
      </Button>
      <AlertDialogContent>
        <form onSubmit={submit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Passwort ändern</AlertDialogTitle>
            <AlertDialogDescription>
              Danach sind alle anderen Geräte abgemeldet. Meldest du dich bisher nur mit Google an, lass das erste Feld leer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-current">Bisheriges Passwort</Label>
            <Input
              id="change-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="change-next">Neues Passwort</Label>
            <Input
              id="change-next"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="mindestens 8 Zeichen"
            />
          </div>
          <ErrorLine error={error} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>
              Abbrechen
            </AlertDialogCancel>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Speichern
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Verwaltung → Benutzer: a one-time link for someone who forgot the password. */
export function ResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const { toast } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const r = await postJson<{ url: string }>(`/users/${encodeURIComponent(userId)}/password-reset-link`, {});
      setLink(r.url);
      setCopied(false);
    } catch (err) {
      toast({ title: "Fehler", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast({ title: "Kopieren ging nicht", description: "Markiere den Link und kopiere ihn von Hand." });
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={create}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        Passwort-Link
      </Button>
      {link && (
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-2" data-testid="reset-link">
          <p className="text-xs text-muted-foreground">
            Schick {name} diesen Link, z. B. per Messenger. Er gilt 24 Stunden und nur einmal.
          </p>
          <div className="flex gap-1.5">
            <Input readOnly value={link} className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
