import { useRef } from "react";
import { Mic } from "lucide-react";
import { usePushToTalk } from "@/hooks/use-push-to-talk";
import { appendPhrase } from "@/lib/speech";

/**
 * A microphone next to a text field: hold it while speaking, let go when done
 * (usePushToTalk). What is said is added to the text, one sentence per phrase
 * (lib/speech.ts), cut at the field's length. Not shown where the browser has
 * no speech recognition. Stops when the field goes away.
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
  /** The big orange button of the everyday tools (Hof-Aufgaben, Alltagsnotizen), half of their button row. */
  big?: boolean;
}) {
  // Several phrases may come before the next render: build on the latest text.
  const latest = useRef(value);
  latest.current = value;
  const { supported, listening, handlers } = usePushToTalk((phrase) => {
    // Never longer than the field allows.
    // The big button of the lists writes one running text (appendPhrase flow).
    latest.current = appendPhrase(latest.current, phrase, { flow: big }).slice(0, max);
    onChange(latest.current);
  });

  if (!supported) return null;

  return (
    <button
      type="button"
      aria-label={`${label} – gedrückt halten`}
      aria-pressed={listening}
      title="Gedrückt halten und sprechen, zum Beenden loslassen"
      {...handlers}
      className={
        big
          ? `inline-flex h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold shadow-sm transition ${
              listening ? "animate-pulse bg-red-600 text-white ring-4 ring-red-300" : "bg-orange-700 text-white hover:bg-orange-800"
            }`
          : `inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs transition ${
              listening ? "animate-pulse bg-red-600 text-white" : "text-muted-foreground hover:bg-muted"
            }`
      }
    >
      <Mic className={big ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5"} />
      {listening ? "Loslassen = fertig" : "Halten & sprechen"}
    </button>
  );
}
