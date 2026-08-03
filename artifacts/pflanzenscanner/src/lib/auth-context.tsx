import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth, type AuthUser } from "@/lib/use-auth";
import { UsernameSetupModal } from "@/components/username-setup-modal";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentAuthUserQueryKey } from "@workspace/api-client-react";
import { runLegacyImageMigration, MIGRATION_FLAG } from "@/lib/legacy-image-migration";

// The auth hook fetches /api/auth/user once per usage - so it is called
// exactly once here and shared via context (layout, pages and the gate all
// need the same answer).
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when we are letting a previously approved user in from the cached
   * identity because the device is offline and the server can't be reached.
   */
  isOfflineSession: boolean;
  /** Rejects with a ready-to-display German message when sign-in fails. */
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    registrationCode?: string,
  ) => Promise<void>;
  logout: () => void;
  /** Refresh the cached user (e.g. after username is set). */
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Persist the last approved identity so the app can be cold-started offline
// (the forest case: open the app with no signal to take photos). We only ever
// cache an APPROVED user, so the offline fallback can never grant access to a
// not-yet-approved or signed-out account.
const CACHE_KEY = "pflanzenscanner:last-approved-user";

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage may be unavailable (private mode); offline fallback just won't
    // work then - the online flow is unaffected.
  }
}

function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(() =>
    readCachedUser(),
  );
  const [isOnline, setIsOnline] = useState<boolean>(getIsOnline());
  // Prevents the migration from firing more than once per mount even if the
  // user/online state changes rapidly.
  const migrationRunningRef = useRef(false);

  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      // Connection is back: re-check the server so a real session is confirmed
      // (or a stale one cleared). We keep serving the cached identity until this
      // resolves, so the user isn't bounced to the login screen mid-session.
      auth.revalidate();
    };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [auth.revalidate]);

  // Keep the offline cache in sync with the live answer from the server.
  useEffect(() => {
    if (auth.isLoading) return;
    if (auth.user) {
      // A fresh server answer. Cache it only while approved; drop it otherwise
      // so a revoked account can't keep scanning offline forever.
      const next = auth.user.approved ? auth.user : null;
      writeCachedUser(next);
      setCachedUser(next);
    } else if (getIsOnline() && !auth.isError) {
      // "No user" from a reachable server = a genuine sign-out. Clear the cache.
      // (While offline or after a failed check we keep it: that null is a
      // network/server failure, not a logout.)
      writeCachedUser(null);
      setCachedUser(null);
    }
  }, [auth.isLoading, auth.user, auth.isError]);

  // ── Legacy image migration ────────────────────────────────────────────────
  // After the first confirmed online session, silently download server-stored
  // legacy images into IndexedDB and clear the DB columns to free storage.
  // Only runs when online with a live server session (not the offline cache),
  // and only once per device (localStorage flag). Failures are swallowed here;
  // the migration function itself retries on the next login if needed.
  useEffect(() => {
    if (!auth.user?.approved || !isOnline || auth.isLoading) return;
    if (migrationRunningRef.current) return;

    try {
      const alreadyDone = localStorage.getItem(MIGRATION_FLAG) === "true";
      if (alreadyDone) return;
    } catch {
      return; // localStorage unavailable – skip silently
    }

    migrationRunningRef.current = true;

    void runLegacyImageMigration(auth.user.isOwner).then((allDone) => {
      migrationRunningRef.current = false;
      if (allDone) {
        try {
          localStorage.setItem(MIGRATION_FLAG, "true");
        } catch {
          // localStorage write failed – migration will re-run next login
        }
      }
    }).catch(() => {
      migrationRunningRef.current = false;
    });
  }, [auth.user?.id, auth.user?.approved, auth.user?.isOwner, isOnline, auth.isLoading]);

  // Serve the cached identity while the live check has no confirmed user AND we
  // either are offline, are still (re)validating, or the auth check itself
  // failed (flaky connection / server hiccup - navigator.onLine can be true
  // while requests still fail). This covers: cold boot offline, the reconnect
  // window where revalidate() is in flight, and transient network errors - so
  // the user is never bounced to the login screen mid-session. Once the live
  // check resolves with a real answer, the server's answer always wins.
  const hasLiveUser = !auth.isLoading && !!auth.user;
  const useOfflineFallback =
    !hasLiveUser &&
    !!cachedUser &&
    (!isOnline || auth.isLoading || auth.isError);

  const activeUser = useOfflineFallback ? cachedUser : auth.user;

  // A user-initiated logout must win over every fallback: drop the cached
  // identity BEFORE telling the server, so that even if the next
  // /api/auth/user check fails (isError), no stale "logged in" state can be
  // served from the cache.
  const logout = useCallback(() => {
    writeCachedUser(null);
    setCachedUser(null);
    void auth.logout();
  }, [auth.logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      await auth.login(email, password);
    },
    [auth.login],
  );

  const register = useCallback(
    async (email: string, password: string, registrationCode?: string) => {
      await auth.register(email, password, registrationCode);
    },
    [auth.register],
  );

  const refreshUser = useCallback(() => {
    // Invalidate the RQ auth/user query so the next render re-fetches.
    void queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    auth.revalidate();
  }, [auth.revalidate, queryClient]);

  // Set username handler — called by UsernameSetupModal on success.
  const handleUsernameSave = useCallback(
    async (username: string) => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/user`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw { data: { error: json.error ?? "Fehler beim Speichern." } };
      }
      // Persist updated user to cache and force a fresh fetch.
      const { user: updated } = (await res.json()) as { user: AuthUser };
      writeCachedUser(updated);
      setCachedUser(updated);
      refreshUser();
    },
    [refreshUser],
  );

  const value: AuthContextValue = useOfflineFallback
    ? {
        user: cachedUser,
        isLoading: false,
        isAuthenticated: true,
        isOfflineSession: true,
        login,
        register,
        logout,
        refreshUser,
      }
    : {
        user: auth.user,
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated,
        isOfflineSession: false,
        login,
        register,
        logout,
        refreshUser,
      };

  // Show the username setup modal for any authenticated, approved user who
  // hasn't chosen a username yet. Skip while offline (can't PATCH the server).
  const needsUsername =
    !!activeUser &&
    activeUser.approved &&
    (activeUser as AuthUser & { username?: string | null }).username == null &&
    isOnline;

  return (
    <AuthContext.Provider value={value}>
      {children}
      {needsUsername && (
        <UsernameSetupModal onSave={handleUsernameSave} />
      )}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
}
