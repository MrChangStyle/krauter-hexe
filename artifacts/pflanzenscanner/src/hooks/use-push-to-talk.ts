import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { speechSupported, startDictation, type Recognition } from "@/lib/speech";

/** Shorter than this and nothing heard: the button was tapped, not held. */
const TAP_MS = 600;
/** The browser ending this soon after a start, again and again, is broken – then give up. */
const QUICK_END_MS = 500;
const MAX_QUICK_ENDS = 3;
/** Errors after which listening again cannot help. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

/**
 * Push to talk for every dictation in the app (docs/spracheingabe.md): hold
 * the button while speaking, let go to stop. Works with finger, mouse and
 * keyboard (Space/Enter held). A short tap only shows how it works.
 * Browsers end the recognition by themselves after a pause or a minute;
 * while the button is still held it starts again, so it never stops early.
 */
export function usePushToTalk(onPhrase: (phrase: string) => void) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const startedAt = useRef(0);
  const heard = useRef(false);
  const held = useRef(false);
  const quickEnds = useRef(0);
  // The latest callback, so phrases after a re-render land in the current text.
  const phrase = useRef(onPhrase);
  phrase.current = onPhrase;

  const stop = () => {
    held.current = false;
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  };
  useEffect(() => () => rec.current?.stop(), []);

  function listen() {
    const began = Date.now();
    let r: Recognition | null = null;
    r = startDictation(
      (p) => {
        heard.current = true;
        quickEnds.current = 0;
        phrase.current(p);
      },
      (error) => {
        if (rec.current !== r) return;
        rec.current = null;
        quickEnds.current = Date.now() - began < QUICK_END_MS ? quickEnds.current + 1 : 0;
        // Still held: the browser stopped on its own (pause, time limit) – go on listening.
        if (held.current && !(error && FATAL.has(error)) && quickEnds.current < MAX_QUICK_ENDS && listen()) return;
        held.current = false;
        setListening(false);
        if (error === "not-allowed") toast({ title: "Kein Mikrofon", description: "Bitte erlaube den Zugriff aufs Mikrofon – oder tippe einfach.", variant: "destructive" });
      },
    );
    rec.current = r;
    return r !== null;
  }

  function start() {
    if (rec.current) return;
    heard.current = false;
    held.current = true;
    quickEnds.current = 0;
    startedAt.current = Date.now();
    if (listen()) setListening(true);
    else held.current = false;
  }

  /** Letting go: what was said so far still comes in, then it stops. */
  function release() {
    if (!rec.current) return;
    const tapped = Date.now() - startedAt.current < TAP_MS && !heard.current;
    stop();
    if (tapped) toast({ title: "Gedrückt halten", description: "Halte den Knopf gedrückt, solange du sprichst, und lass dann los." });
  }

  const isKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (!isKey(e)) return;
      e.preventDefault();
      if (!e.repeat) start();
    },
    onKeyUp(e: KeyboardEvent<HTMLElement>) {
      if (!isKey(e)) return;
      e.preventDefault();
      release();
    },
    // A long press must not open the phone's menu or select the label.
    onContextMenu(e: { preventDefault: () => void }) {
      e.preventDefault();
    },
    style: { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as CSSProperties,
  };

  return { supported: speechSupported(), listening, stop, handlers };
}
