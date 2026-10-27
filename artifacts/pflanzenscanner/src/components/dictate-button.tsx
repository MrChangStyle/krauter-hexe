import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { appendPhrase, speechSupported, startDictation, type Recognition } from "@/lib/speech";

/**
 * A microphone next to a note field: what is said is added to the text, one
 * sentence per phrase (lib/speech.ts), cut at the field's length. Not shown where the browser has no
 * speech recognition. Stops when the field goes away.
 */
export function DictateButton({
  value,
  onChange,
  max,
  label = "Notiz sprechen",
  big = false,
}: {
  value: string;
  onChange: (text: string) => void;
  max: number;
  label?: string;
  /** The orange pill of the everyday tools (Hof-Aufgaben, Alltagsnotizen). */
  big?: boolean;
}) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  // Several phrases may come before the next render: build on the latest text.
  const latest = useRef(value);
  latest.current = value;

  const stop = () => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  };
  useEffect(() => () => rec.current?.stop(), []);

  if (!speechSupported()) return null;

  function toggle() {
    if (listening) return stop();
    const r = startDictation(
      (phrase) => {
        // Never longer than the field allows.
        latest.current = appendPhrase(latest.current, phrase).slice(0, max);
        onChange(latest.current);
      },
      (error) => {
        rec.current = null;
        setListening(false);
        if (error === "not-allowed") toast({ title: "Kein Mikrofon", description: "Bitte erlaube den Zugriff aufs Mikrofon – oder tippe einfach.", variant: "destructive" });
      },
    );
    if (r) {
      rec.current = r;
      setListening(true);
    }
  }

  return (
    <button
      type="button"
      aria-label={listening ? "Diktat beenden" : label}
      aria-pressed={listening}
      onClick={toggle}
      className={
        big
          ? `inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow-sm ${
              listening ? "animate-pulse bg-red-600 text-white" : "bg-orange-500 text-white hover:bg-orange-600"
            }`
          : `inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs ${
              listening ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`
      }
    >
      {listening ? <MicOff className={big ? "h-4 w-4" : "h-3.5 w-3.5"} /> : <Mic className={big ? "h-4 w-4" : "h-3.5 w-3.5"} />}
      {listening ? "Stopp" : "Sprechen"}
    </button>
  );
}
