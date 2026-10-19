import { Component, type ReactNode } from "react";
import { HenniAvatar } from "@/components/henni";
import { reportError } from "@/lib/error-reporter";

/**
 * When a page crashes while rendering: a friendly message instead of a white
 * screen, and the error goes to the owner's error monitor.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, "Render");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <HenniAvatar size={64} />
        <h1 className="text-xl font-semibold">Da ist etwas schiefgelaufen</h1>
        <p className="text-sm text-muted-foreground">Der Fehler wurde gemeldet. Lade die Seite neu – deine Daten sind sicher.</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
          Neu laden
        </button>
      </div>
    );
  }
}
