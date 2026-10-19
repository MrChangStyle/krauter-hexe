import { useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { getGetAppStatusQueryKey, useGetAppStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const KEY = "lf-status-dismissed";

function dismissed(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The owner's notice during a disruption, for everyone (also before sign-in). */
export function StatusBanner() {
  const status = useGetAppStatus({ query: { queryKey: getGetAppStatusQueryKey(), refetchInterval: 5 * 60 * 1000, staleTime: 60 * 1000, retry: false } });
  const [hidden, setHidden] = useState(dismissed());
  const s = status.data;
  if (!s?.message || hidden === s.updatedAt) return null;
  const warning = s.level === "warning";
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 px-4 py-2 text-sm",
        warning ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
      )}
    >
      {warning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
      <p className="flex-1">{s.message}</p>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        className="rounded p-0.5 opacity-70 hover:opacity-100"
        onClick={() => {
          try {
            localStorage.setItem(KEY, s.updatedAt ?? "");
          } catch {
            /* ignore */
          }
          setHidden(s.updatedAt);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
