import { useEffect, useState } from 'react';

/** What the server offers on the login screen, from GET /api/auth/providers. */
export interface AuthProviders {
  /** "Mit Google anmelden" is configured. */
  google: boolean;
  /** Cloudflare Turnstile site key; null = no bot check on registration. */
  turnstileSiteKey: string | null;
  /** New accounts can use the app right away (no approval by the owner). */
  openRegistration: boolean;
}

const NOTHING_EXTRA: AuthProviders = {
  google: false,
  turnstileSiteKey: null,
  openRegistration: false,
};

/**
 * Asks the server which sign-in options it offers.
 *
 * Google and Turnstile are optional (they need keys on the server), so the
 * login screen asks instead of assuming. While the answer is unknown – and
 * whenever the request fails, e.g. offline – nothing extra is offered: a
 * button that can only fail is worse than no button.
 */
export function useAuthProviders(): AuthProviders {
  const [providers, setProviders] = useState<AuthProviders>(NOTHING_EXTRA);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/providers', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<Partial<AuthProviders>>) : null))
      .then((data) => {
        if (cancelled) return;
        setProviders({
          google: data?.google === true,
          turnstileSiteKey:
            typeof data?.turnstileSiteKey === 'string' && data.turnstileSiteKey
              ? data.turnstileSiteKey
              : null,
          openRegistration: data?.openRegistration === true,
        });
      })
      .catch(() => {
        if (!cancelled) setProviders(NOTHING_EXTRA);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

/** Shorthand kept for callers that only need the Google flag. */
export function useGoogleSignInAvailable(): boolean {
  return useAuthProviders().google;
}
