import { KeyRound } from "lucide-react";
import { ResetPasswordForm, resetTokenFrom } from "@/components/password";
import { APP_PATH, markInApp } from "@/lib/app-entry";

/**
 * The page behind a reset link (docs/konto.md). Public: whoever opens it is
 * signed out. After saving, the server has signed them in – into the app.
 */
export default function PasswortNeuPage() {
  const token = resetTokenFrom(window.location.search);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Neues Passwort</h1>
        <p className="max-w-xs text-sm text-muted-foreground">Little Farming</p>
      </div>
      <ResetPasswordForm
        token={token}
        onDone={() => {
          markInApp();
          window.location.replace(`${base}${APP_PATH}`);
        }}
      />
    </div>
  );
}
