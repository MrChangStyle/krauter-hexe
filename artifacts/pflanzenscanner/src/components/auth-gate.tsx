import { useState, type FormEvent, type ReactNode } from "react";
import { Leaf, LogIn, LogOut, Hourglass, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/lib/auth-context";
import { PeckingChicken } from "@/components/pecking-chicken";

function FullScreenCentered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      {children}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Leaf className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Kräuterhexe</h1>
    </div>
  );
}

const MIN_PASSWORD_LENGTH = 8;

function LoginScreen() {
  const { login, register } = useAuthContext();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setPassword("");
    setRegistrationCode("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    // Checked here as well as on the server so a typo gets an instant answer
    // instead of a round trip.
    if (isRegister && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password, registrationCode.trim() || undefined);
      } else {
        await login(email, password);
      }
      // On success the auth state updates and this screen unmounts.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <FullScreenCentered>
      <BrandMark />
      <p className="max-w-xs text-sm text-muted-foreground mb-6">
        {isRegister
          ? "Lege ein Konto an. Der Besitzer der App schaltet dich anschließend frei."
          : "Privater Zugang: Bitte melde dich an, um Pflanzen zu scannen und das Archiv zu sehen."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col gap-4 text-left"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-email">E-Mail</Label>
          <Input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@beispiel.de"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-password">Passwort</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={isRegister ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "mindestens 8 Zeichen" : "••••••••"}
          />
        </div>

        {isRegister && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-code">
              Einladungscode{" "}
              <span className="font-normal text-muted-foreground">
                (falls vorhanden)
              </span>
            </Label>
            <Input
              id="auth-code"
              type="text"
              autoComplete="off"
              value={registrationCode}
              onChange={(e) => setRegistrationCode(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full gap-2"
          disabled={isSubmitting}
        >
          {isRegister ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {isSubmitting
            ? "Einen Moment …"
            : isRegister
              ? "Konto anlegen"
              : "Anmelden"}
        </Button>
      </form>

      <button
        type="button"
        className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => switchMode(isRegister ? "login" : "register")}
      >
        {isRegister
          ? "Ich habe schon ein Konto – anmelden"
          : "Noch kein Konto? Jetzt anlegen"}
      </button>
    </FullScreenCentered>
  );
}

function WaitingForApprovalScreen() {
  const { user, logout } = useAuthContext();

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Dein Konto";

  return (
    <FullScreenCentered>
      <BrandMark />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 mb-4">
        <Hourglass className="h-6 w-6 text-amber-600" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Warte auf Freigabe</h2>
      <p className="max-w-xs text-sm text-muted-foreground mb-8">
        {name} ist angemeldet, wurde aber noch nicht freigeschaltet. Der
        Besitzer der App muss dein Konto zuerst freigeben – danach kannst du
        loslegen.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button
          variant="default"
          className="gap-2"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          Erneut prüfen
        </Button>
        <Button variant="outline" className="gap-2" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Abmelden
        </Button>
      </div>
    </FullScreenCentered>
  );
}

// Renders the app only for signed-in AND approved accounts. Everyone else
// sees either the login screen or the waiting-for-approval screen - no plant
// data is fetched or shown before that.
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuthContext();

  if (isLoading) {
    return (
      <FullScreenCentered>
        <PeckingChicken size={120} label="Einen Moment …" className="text-primary" />
      </FullScreenCentered>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (!user?.approved) {
    return <WaitingForApprovalScreen />;
  }

  return <>{children}</>;
}
