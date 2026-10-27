import type { ReactNode } from "react";

/**
 * The look of the two everyday tools (Hof-Aufgaben, Alltagsnotizen): the
 * orange frame and warm gradient of their tiles on the Hof, here around the
 * input on their pages – one picture across the app.
 */
export const TOOL_FRAME =
  "rounded-2xl border-2 border-orange-400 bg-gradient-to-br from-orange-50 to-amber-50 shadow-sm dark:border-orange-700 dark:from-orange-950/50 dark:to-amber-950/30";

/** The orange primary button of the tools. */
export const TOOL_BUTTON = "bg-orange-600 text-white shadow-sm hover:bg-orange-700";

/**
 * The input card of both tools, built the same way: title on top, the text,
 * then Halten & sprechen next to Speichern, the explanation last.
 */
export function ToolCardHeader({ icon, title, hint }: { icon: ReactNode; title: ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight text-orange-950 dark:text-orange-100">{title}</span>
        <span className="block text-xs text-orange-900/70 dark:text-orange-200/70">{hint}</span>
      </span>
    </div>
  );
}

/** Halten & sprechen and Speichern, side by side and the same size. */
export function ToolActions({ children }: { children: ReactNode }) {
  return <div className="flex items-stretch gap-2">{children}</div>;
}

/** The save button of the tools, as big as Halten & sprechen. */
export const TOOL_SAVE = `h-11 min-w-0 flex-1 basis-0 gap-1.5 rounded-xl px-2 text-[13px] ${TOOL_BUTTON}`;

/** Longest text spoken or typed at once into a tool (the server takes the same). */
export const MAX_SAID = 2000;
