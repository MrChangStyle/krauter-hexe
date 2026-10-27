import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Ban, Leaf, LogIn, LogOut, Hourglass, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/lib/auth-context";
import { PeckingChicken } from "@/components/pecking-chicken";
import {
  buildGoogleSignInUrl,
  describeSignInError,
  readSignInError,
  stripSignInParam,
} from "@/lib/google-sign-in";
import { useAuthProviders } from "@/lib/use-auth-providers";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";
import { TurnstileWidget, type TurnstileHandle } from "@/components/turnstile-widget";
import { SiteApp } from "@/components/site/site-app";
import { APP_PATH, markInApp, tabIsInApp } from "@/lib/app-entry";

/** Google's four-colour "G", the mark their brand guidelines ask for. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 3-2.26 5.54-4.78 7.25l7.73 6c4.51-4.18 7.09-10.36 7.09-17.72z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.28-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

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
      <h1 className="text-2xl font-bold tracking-tight">Little Farming</h1>
      <p className="-mt-2 text-xs uppercase tracking-widest text-muted-foreground">
        mit der Kräuterhexe
      </p>
    </div>
  );
}

const MIN_PASSWORD_LENGTH = 8;

/** Link to a legal page in a new tab, so a half-filled form is not lost. */
function LegalLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      href={legalHref(path)}
      target="_blank"
      rel="noopener"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}

function LegalFooter() {
  return (
    <nav className="mt-8 flex gap-4 text-xs text-muted-foreground">
      <LegalLink path={LEGAL_PATHS.impressum}>Impressum</LegalLink>
      <LegalLink path={LEGAL_PATHS.datenschutz}>Datenschutz</LegalLink>
      <LegalLink path={LEGAL_PATHS.nutzungsbedingungen}>Nutzungsbedingungen</LegalLink>
    </nav>
  );
}

function LoginScreen({ initialMode = "login", onBack }: { initialMode?: "login" | "register"; onBack?: () => void }) {
  const { login, register } = useAuthContext();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const providers = useAuthProviders();
  const googleAvailable = providers.google;
  const turnstileSiteKey = providers.turnstileSiteKey;

  const isRegister = mode === "register";

  // A failed Google sign-in comes back as a query parameter on the app URL.
  // Show it once, then drop it so a reload (or a bookmark) does not repeat a
  // message about something that happened minutes ago.
  useEffect(() => {
    const code = readSignInError(window.location.search);
    if (!code) return;
    setError(describeSignInError(code));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${stripSignInParam(window.location.search)}${window.location.hash}`,
    );
  }, []);

  function handleGoogleSignIn() {
    // Full page navigation, not fetch: the browser has to follow the redirect
    // to Google and back for the session cookie to be set.
    window.location.href = buildGoogleSignInUrl(
      `${window.location.pathname}${window.location.search}`,
    );
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setPassword("");
    setRegistrationCode("");
    setAcceptTerms(false);
    setTurnstileToken(null);
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
    if (isRegister && !acceptTerms) {
      setError("Bitte stimme der Datenschutzerklärung und den Nutzungsbedingungen zu.");
      return;
    }
    if (isRegister && turnstileSiteKey && !turnstileToken) {
      setError(
        turnstileFailed
          ? "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfe deine Verbindung und lade die Seite neu."
          : "Bitte warte kurz, bis die Sicherheitsprüfung abgeschlossen ist.",
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password, {
          acceptTerms,
          registrationCode: registrationCode.trim() || undefined,
          turnstileToken: turnstileToken ?? undefined,
        });
      } else {
        await login(email, password);
      }
      // On success the auth state updates and this screen unmounts.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.",
      );
      // A Turnstile token is single-use: get a fresh one for the next try.
      if (isRegister) turnstileRef.current?.reset();
      setIsSubmitting(false);
    }
  }

  return (
    <FullScreenCentered>
      <BrandMark />
      <p className="max-w-xs text-sm text-muted-foreground mb-6">
        {isRegister
          ? providers.openRegistration
            ? "Lege ein kostenloses Konto an und leg direkt los."
            : "Lege ein Konto an. Die ersten Tester können sofort loslegen, danach schaltet dich der Betreiber frei."
          : providers.openRegistration
            ? "Melde dich an, um Pflanzen zu scannen und das Archiv zu sehen."
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

        {/* Only when the server asks for one – an optional field made testers
            type the site password there, which then counted as a wrong code. */}
        {isRegister && providers.registrationCode && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-code">
              Einladungscode{" "}
              <span className="font-normal text-muted-foreground">
                (vom Betreiber der App)
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

        {isRegister && (
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="auth-terms"
              checked={acceptTerms}
              onCheckedChange={(checked) => setAcceptTerms(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="auth-terms" className="text-xs font-normal leading-snug text-muted-foreground">
              Ich akzeptiere die{" "}
              <LegalLink path={LEGAL_PATHS.nutzungsbedingungen}>Nutzungsbedingungen</LegalLink>{" "}
              und habe die{" "}
              <LegalLink path={LEGAL_PATHS.datenschutz}>Datenschutzerklärung</LegalLink>{" "}
              gelesen.
            </Label>
          </div>
        )}

        {isRegister && turnstileSiteKey && (
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            onToken={(token) => {
              setTurnstileToken(token);
              if (token) setTurnstileFailed(false);
            }}
            onLoadError={() => setTurnstileFailed(true)}
          />
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

      {googleAvailable && (
        <div className="mt-5 flex w-full max-w-xs flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              oder
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full gap-2"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            <GoogleMark />
            Mit Google anmelden
          </Button>
          <p className="text-xs text-muted-foreground">
            Mit der Anmeldung über Google akzeptierst du die{" "}
            <LegalLink path={LEGAL_PATHS.nutzungsbedingungen}>Nutzungsbedingungen</LegalLink>{" "}
            und die{" "}
            <LegalLink path={LEGAL_PATHS.datenschutz}>Datenschutzerklärung</LegalLink>.
          </p>
        </div>
      )}

      <button
        type="button"
        className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => switchMode(isRegister ? "login" : "register")}
      >
        {isRegister
          ? "Ich habe schon ein Konto – anmelden"
          : "Noch kein Konto? Jetzt anlegen"}
      </button>
      {onBack && (
        <button type="button" className="mt-3 text-sm text-muted-foreground underline underline-offset-4" onClick={onBack}>
          Zurück zur Startseite
        </button>
      )}

      <LegalFooter />
    </FullScreenCentered>
  );
}

function WaitingForApprovalScreen() {
  const { user, logout } = useAuthContext();

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Dein Konto";

  if (user?.blockedAt) {
    return (
      <FullScreenCentered>
        <BrandMark />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 mb-4">
          <Ban className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Konto gesperrt</h2>
        <p className="max-w-xs text-sm text-muted-foreground mb-8">
          Dieses Konto wurde wegen eines Verstoßes gegen die{" "}
          <LegalLink path={LEGAL_PATHS.nutzungsbedingungen}>Nutzungsbedingungen</LegalLink>{" "}
          gesperrt. Wenn du denkst, dass das ein Irrtum ist, schreib uns an die
          Adresse im <LegalLink path={LEGAL_PATHS.impressum}>Impressum</LegalLink>.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button variant="outline" className="gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Abmelden
          </Button>
        </div>
        <LegalFooter />
      </FullScreenCentered>
    );
  }

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

/** "?start=login|register" from the homepage's sub pages opens the form directly. */
function startView(search: string): "landing" | "login" | "register" {
  if (readSignInError(search)) return "login";
  const start = new URLSearchParams(search).get("start");
  if (start === "login" || start === "register") return start;
  // Came through littlefarming.de/app (or was in the app): straight to the form.
  return tabIsInApp() ? "login" : "landing";
}

/**
 * Signed out: the homepage first (docs/landingpage.md), the login form
 * after "Anmelden" or "Registrieren". A failed Google sign-in comes back to
 * the form straight away.
 */
function PublicStart() {
  const [view, setView] = useState<"landing" | "login" | "register">(() => startView(window.location.search));
  const providers = useAuthProviders();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  if (view === "landing") {
    // Straight from the start page – no detour through the form.
    const google = providers.google ? (
      <div className="mx-auto flex w-full flex-col items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full gap-2 sm:w-auto"
          onClick={() => (window.location.href = buildGoogleSignInUrl(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${APP_PATH}`))}
        >
          <GoogleMark />
          Mit Google anmelden
        </Button>
        <p className="text-xs text-muted-foreground">
          Mit der Anmeldung über Google akzeptierst du die{" "}
          <LegalLink path={LEGAL_PATHS.nutzungsbedingungen}>Nutzungsbedingungen</LegalLink> und die{" "}
          <LegalLink path={LEGAL_PATHS.datenschutz}>Datenschutzerklärung</LegalLink>.
        </p>
      </div>
    ) : null;
    // Signing in from the homepage leads into the app afterwards.
    const open = (next: "login" | "register") => {
      markInApp();
      setView(next);
    };
    return <SiteApp onLogin={() => open("login")} onRegister={() => open("register")} google={google} />;
  }
  return <LoginScreen key={view} initialMode={view} onBack={() => setView("landing")} />;
}

// Renders the app only for signed-in AND approved accounts. Everyone else
// sees either the login screen or the waiting-for-approval screen - no plant
// data is fetched or shown before that.
export default function AuthGate({ children, site = false }: { children: ReactNode; site?: boolean }) {
  const { user, isLoading, isAuthenticated } = useAuthContext();

  if (isLoading) {
    return (
      <FullScreenCentered>
        <PeckingChicken size={120} label="Einen Moment …" className="text-primary" />
      </FullScreenCentered>
    );
  }

  if (!isAuthenticated) {
    return <PublicStart />;
  }

  // littlefarming.de in a browser tab: the homepage, also when signed in ("Zur App" in its header).
  if (site && !tabIsInApp()) {
    return <SiteApp />;
  }

  if (!user?.approved) {
    return <WaitingForApprovalScreen />;
  }

  return <>{children}</>;
}
