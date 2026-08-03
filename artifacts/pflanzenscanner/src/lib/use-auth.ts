import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when the last /api/auth/user check failed (network error or server
   * trouble) - i.e. we do NOT know whether the user is signed out. Callers
   * can keep a cached identity active in that case instead of bouncing the
   * user to the login screen.
   */
  isError: boolean;
  /** Throws an Error with a ready-to-display German message on failure. */
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    email: string,
    password: string,
    registrationCode?: string,
  ) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-run the /api/auth/user check (e.g. after coming back online). */
  revalidate: () => void;
}

/** Turns a failed response into an Error carrying the server's German text. */
async function toError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(
    body.error ??
      (res.status >= 500
        ? "Der Server antwortet gerade nicht. Bitte versuche es später erneut."
        : "Anmeldung fehlgeschlagen."),
  );
}

async function postCredentials(
  path: string,
  body: Record<string, string>,
): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new Error(
      "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.",
    );
  }
  if (!res.ok) throw await toError(res);

  const data = (await res.json()) as { user: AuthUser | null };
  if (!data.user) throw new Error("Anmeldung fehlgeschlagen.");
  return data.user;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  // Bumped on every fetch so a slow in-flight request can't overwrite the
  // result of a newer one (e.g. mount fetch vs. a revalidate on reconnect).
  const requestSeq = useRef(0);

  const revalidate = useCallback(() => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (seq === requestSeq.current) {
          setUser(data.user ?? null);
          setIsError(false);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (seq === requestSeq.current) {
          // Network failure or server error: we don't know the auth state.
          // Keep the previous user (don't force a logout) and flag the error
          // so callers can fall back to a cached identity.
          setIsError(true);
          setIsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    revalidate();
  }, [revalidate]);

  /** Adopts the signed-in user directly, so no extra round trip is needed. */
  const adopt = useCallback((next: AuthUser) => {
    // Invalidate any in-flight check so its (pre-login) answer can't land
    // afterwards and wipe the user we just signed in.
    requestSeq.current += 1;
    setUser(next);
    setIsError(false);
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await postCredentials("/auth/login", { email, password });
      adopt(next);
      return next;
    },
    [adopt],
  );

  const register = useCallback(
    async (email: string, password: string, registrationCode?: string) => {
      const next = await postCredentials("/auth/register", {
        email,
        password,
        ...(registrationCode ? { registrationCode } : {}),
      });
      adopt(next);
      return next;
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    requestSeq.current += 1;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Offline logout: the cookie stays until the device is online again,
      // but the local state below already signs the user out of the UI.
    }
    setUser(null);
    setIsError(false);
    setIsLoading(false);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isError,
    login,
    register,
    logout,
    revalidate,
  };
}
