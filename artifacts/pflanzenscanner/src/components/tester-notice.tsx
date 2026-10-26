import { useState } from "react";
import { Gift, X } from "lucide-react";
import { useGetPremium } from "@workspace/api-client-react";

const DISMISS_KEY = "lf-tester-notice-closed";

function readClosed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** The text for the account's free access in the Testphase (docs/premium.md); null for anyone else. */
export function testerText(source: string | null | undefined): { title: string; text: string } | null {
  if (source === "test") {
    return {
      title: "Testphase: alles offen und kostenlos",
      text: "Gerade sind alle Funktionen frei – auch die KI, mit einem Tageslimit. Und weil du jetzt testest, bleibt die App für dich auch nach dem Start kostenlos. Danke fürs Mitmachen!",
    };
  }
  if (source === "tester") {
    return { title: "Danke fürs Testen", text: "Du warst in der Testphase dabei – deshalb bleibt die App mit allen Funktionen für dich kostenlos." };
  }
  return null;
}

/**
 * The Testphase note: on the Hof once until closed (closable per kind, so the
 * "tester" thank-you after the start shows again), in Mehr always.
 */
export function TesterNotice({ closable = false }: { closable?: boolean }) {
  const premium = useGetPremium();
  const source = premium.data?.source;
  const [closed, setClosed] = useState(readClosed);
  const t = testerText(source);
  if (!t || (closable && closed === source)) return null;
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="tester-notice">
      <Gift className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.title}</p>
        <p className="mt-0.5 opacity-90">{t.text}</p>
      </div>
      {closable && (
        <button
          type="button"
          aria-label="Hinweis schließen"
          className="-m-1 h-8 w-8 shrink-0 rounded-full p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, source ?? "");
            } catch {
              // No storage: it is closed for this visit only.
            }
            setClosed(source ?? null);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
