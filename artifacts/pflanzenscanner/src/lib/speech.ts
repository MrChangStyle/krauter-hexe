/**
 * Dictation for the feedback bubble: the browser's speech recognition
 * (Chrome/Android, Safari) in German. Missing on some browsers – then the
 * microphone button is simply not shown.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

/** Starts German dictation; `onText` gets each finished phrase. Returns null without support. */
export function startDictation(onText: (text: string) => void, onStop: (error?: string) => void): Recognition | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "de-DE";
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]!;
      if (r.isFinal) onText(r[0].transcript.trim());
    }
  };
  rec.onerror = (event) => onStop(event.error);
  rec.onend = () => onStop();
  rec.start();
  return rec;
}

/** Adds a dictated phrase to what is already typed. */
export function appendPhrase(current: string, phrase: string): string {
  if (!phrase) return current;
  const sentence = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  if (!current.trim()) return sentence;
  return `${current.replace(/\s+$/, "")}${/[.!?]$/.test(current.trim()) ? " " : ". "}${sentence}`;
}
