import { useEffect, useState } from 'react';

/**
 * Which extra sign-in methods this server offers.
 *
 * Google is optional (it needs a client id and secret on the server), so the
 * login screen asks instead of assuming. While the answer is unknown – and
 * whenever the request fails, e.g. offline – nothing extra is offered: a
 * button that can only fail is worse than no button.
 */
export function useGoogleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/providers', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ google?: boolean }>) : null))
      .then((data) => {
        if (!cancelled) setAvailable(data?.google === true);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
