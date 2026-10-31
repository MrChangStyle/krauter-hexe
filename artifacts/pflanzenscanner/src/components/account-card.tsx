import { useState, type FormEvent } from "react";
import { Check, Copy, Download, Loader2, Pencil, Trash2, UserRound } from "lucide-react";
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
import { useAuthContext } from "@/lib/auth-context";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";
import { ChangePasswordButton } from "@/components/password";
import { FindSpotsSwitch } from "@/components/find-spots";

/**
 * Meine Daten herunterladen (docs/datenexport.md): fetches the file and hands
 * it to the browser, so a refusal shows as a message instead of a JSON page.
 */
export async function downloadMyData(fetchFn: typeof fetch = fetch): Promise<void> {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetchFn(`${base}/api/auth/user/export`, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Der Download hat nicht geklappt. Bitte versuche es später noch einmal.");
  }
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "little-farming-daten.json";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Sends DELETE /api/auth/user. Resolves on success, rejects with an Error
 * carrying the server's German message otherwise.
 */
export async function requestAccountDeletion(
  confirmation: { password: string } | { confirmEmail: string },
): Promise<void> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/auth/user`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmation),
      credentials: "include",
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.");
  }
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? "Das Konto konnte nicht gelöscht werden.");
}

/**
 * Sends PATCH /api/auth/user with the new first and last name (docs/konto.md).
 * Empty means "not given". Rejects with the server's German message.
 */
export async function requestNameChange(
  names: { firstName: string; lastName: string },
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetchFn(`${base}/api/auth/user`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: names.firstName.trim(), lastName: names.lastName.trim() }),
      credentials: "include",
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.");
  }
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? "Der Name konnte nicht gespeichert werden.");
}

/**
 * "Dein Konto" on the Home page: who is signed in, links to the legal pages
 * and deleting the account. The owner account cannot be deleted (it is the
 * one that approves and moderates everybody else), so the owner sees no
 * delete button.
 */
export function AccountCard() {
  const { user, logout } = useAuthContext();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadMyData();
    } catch (err) {
      toast({ title: "Download fehlgeschlagen", description: (err as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }
  // Accounts that only ever signed in with Google have no password; they
  // confirm by typing their email address instead.
  const [withEmail, setWithEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  function reset(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    setWithEmail(false);
    setPassword("");
    setConfirmEmail("");
    setError(null);
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestAccountDeletion(
        withEmail ? { confirmEmail: confirmEmail.trim() } : { password },
      );
      setOpen(false);
      logout();
      toast({
        title: "Konto gelöscht",
        description: "Dein Konto und deine persönlichen Daten wurden entfernt.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das Konto konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserRound className="h-4 w-4 text-primary" />
        Dein Konto
      </h2>
      <NameEditor firstName={user.firstName} lastName={user.lastName} />
      {user.email && (
        <p className="text-sm text-muted-foreground break-all">{user.email}</p>
      )}
      {user.userCode && <UserCodeBox code={user.userCode} />}

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <a href={legalHref(LEGAL_PATHS.impressum)} className="underline underline-offset-4">
          Impressum
        </a>
        <a href={legalHref(LEGAL_PATHS.datenschutz)} className="underline underline-offset-4">
          Datenschutz
        </a>
        <a
          href={legalHref(LEGAL_PATHS.nutzungsbedingungen)}
          className="underline underline-offset-4"
        >
          Nutzungsbedingungen
        </a>
      </nav>

      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Meine Daten herunterladen
        </Button>
        <p className="text-xs text-muted-foreground">
          Eine Datei mit allem, was Little Farming zu deinem Konto speichert – auch die Höfe, die du leitest.
        </p>
      </div>

      <ChangePasswordButton />

      <FindSpotsSwitch />

      {!user.isOwner && (
        <AlertDialog open={open} onOpenChange={reset}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => reset(true)}
          >
            <Trash2 className="h-4 w-4" />
            Konto löschen
          </Button>
          <AlertDialogContent>
            <form onSubmit={handleDelete} className="space-y-4">
              <AlertDialogHeader>
                <AlertDialogTitle>Konto endgültig löschen?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      Gelöscht werden dein Konto, deine Favoriten, Aufgaben,
                      Pflege-Guides, Erinnerungen und dein Scan-Verlauf. Das
                      lässt sich nicht rückgängig machen.
                    </p>
                    <p>
                      Arten, die du dem gemeinsamen Archiv hinzugefügt hast,
                      bleiben für alle erhalten – ohne Bezug zu dir. Fotos auf
                      diesem Gerät bleiben, bis du die App-Daten im Browser
                      löschst.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>

              {withEmail ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-confirm-email">
                    Zur Bestätigung deine E-Mail-Adresse
                  </Label>
                  <Input
                    id="delete-confirm-email"
                    type="email"
                    autoComplete="off"
                    required
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-password">Zur Bestätigung dein Passwort</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => {
                  setWithEmail(!withEmail);
                  setError(null);
                }}
              >
                {withEmail
                  ? "Ich habe ein Passwort"
                  : "Ich melde mich nur mit Google an und habe kein Passwort"}
              </button>

              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel type="button" disabled={busy}>
                  Abbrechen
                </AlertDialogCancel>
                <Button type="submit" variant="destructive" disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Endgültig löschen
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

/**
 * Nutzer-ID (docs/konto.md): the number the account passes on, so an admin
 * adds it to a farm (Team, Vertretung, Tierarzt) or someone shares a list.
 */
export function UserCodeBox({ code, hint }: { code: number; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3" data-testid="user-code">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">Deine Nutzer-ID</span>
        <span className="block font-mono text-2xl font-semibold tracking-widest">{code}</span>
        <span className="block text-xs text-muted-foreground">{hint ?? "Gib sie weiter, damit man dich ins Team, als Vertretung oder zu einer Liste holen kann."}</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5"
        onClick={() => {
          void navigator.clipboard?.writeText(String(code)).then(() => setCopied(true));
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Kopiert" : "Kopieren"}
      </Button>
    </div>
  );
}

/**
 * Vor- und Nachname (docs/konto.md): shown to others in the team, on shared
 * lists and tasks. Changeable any time, e.g. a new last name after a wedding.
 */
function NameEditor({ firstName, lastName }: { firstName: string | null; lastName: string | null }) {
  const { refreshUser } = useAuthContext();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  function start() {
    setFirst(firstName ?? "");
    setLast(lastName ?? "");
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestNameChange({ firstName: first, lastName: last });
      refreshUser();
      setEditing(false);
      toast({ title: "Name geändert", description: "Andere sehen ihn ab jetzt in Team, Listen und Aufgaben." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Name konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3" data-testid="account-name">
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Dein Name</span>
          <span className="block break-words font-medium">{fullName || "Noch kein Name eingetragen"}</span>
        </span>
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={start}>
          <Pencil className="h-4 w-4" />
          {fullName ? "Ändern" : "Eintragen"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3 rounded-xl border bg-muted/40 p-3" data-testid="account-name-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-first-name">Vorname</Label>
          <Input id="account-first-name" autoComplete="given-name" maxLength={50} value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-last-name">Nachname</Label>
          <Input id="account-last-name" autoComplete="family-name" maxLength={50} value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">So sehen dich andere im Team, auf geteilten Listen und bei Aufgaben.</p>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Speichern
        </Button>
      </div>
    </form>
  );
}
