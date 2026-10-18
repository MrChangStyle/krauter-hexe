import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Cloudflare Turnstile – the bot check on the registration form.
 *
 * Loads Cloudflare's script once, renders the widget explicitly into our own
 * element and reports the token through onToken (null when it expires or
 * fails). A token is single-use, so the parent calls reset() after every
 * submit that did not succeed.
 */

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      language?: string;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile not available"));
    script.onerror = () => {
      // Allow a later attempt (e.g. after coming back online).
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string | null) => void;
  onLoadError?: () => void;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onToken, onLoadError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const apiRef = useRef<TurnstileApi | null>(null);
    // Latest callbacks without re-rendering the widget when they change.
    const onTokenRef = useRef(onToken);
    const onLoadErrorRef = useRef(onLoadError);
    onTokenRef.current = onToken;
    onLoadErrorRef.current = onLoadError;

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenRef.current(null);
        if (apiRef.current && widgetIdRef.current) {
          apiRef.current.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadTurnstile()
        .then((api) => {
          if (cancelled || !containerRef.current) return;
          apiRef.current = api;
          widgetIdRef.current = api.render(containerRef.current, {
            sitekey: siteKey,
            language: "de",
            theme: "auto",
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => {
          if (!cancelled) onLoadErrorRef.current?.();
        });

      return () => {
        cancelled = true;
        if (apiRef.current && widgetIdRef.current) {
          apiRef.current.remove(widgetIdRef.current);
        }
        widgetIdRef.current = null;
      };
    }, [siteKey]);

    return <div ref={containerRef} className="flex justify-center" />;
  },
);
