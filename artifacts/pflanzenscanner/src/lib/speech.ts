/**
 * Dictation for the feedback bubble and the note fields (DictateButton): the browser's speech recognition
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

// Punctuation said aloud ("Nudeln Komma Eier") – most phones write the word.
const SPOKEN_MARKS: Array<[RegExp, string]> = [
  [/\s*(?<![\p{L}\d])(?:neue zeile|neuer absatz|absatz)(?![\p{L}\d])\s*/giu, "\n"],
  [/\s*(?<![\p{L}\d])doppelpunkt(?![\p{L}\d])/giu, ":"],
  [/\s*(?<![\p{L}\d])fragezeichen(?![\p{L}\d])/giu, "?"],
  [/\s*(?<![\p{L}\d])ausrufezeichen(?![\p{L}\d])/giu, "!"],
  [/\s*(?<![\p{L}\d])komma(?![\p{L}\d])/giu, ","],
  [/\s*(?<![\p{L}\d])punkt(?![\p{L}\d])/giu, "."],
];

/** "Nudeln Komma Eier Punkt" → "Nudeln, Eier." */
export function spokenPunctuation(phrase: string): string {
  let out = phrase;
  for (const [re, mark] of SPOKEN_MARKS) out = out.replace(re, mark);
  // "Nudeln,Eier" → "Nudeln, Eier"; no space at the very start.
  return out.replace(/([,.:?!])(?=[^\s\d,.:?!])/gu, "$1 ").replace(/^[\s,.:]+/, "").trim();
}

/**
 * Adds a dictated phrase to what is already typed: as a new sentence, or –
 * with `flow` (the lists of Hof-Aufgaben and Alltagsnotizen) – as one running
 * text. Phones end a phrase wherever the speaker pauses to think; a list must
 * not be cut into sentences there. Marks said aloud ("Komma") still count.
 */
export function appendPhrase(current: string, raw: string, { flow = false }: { flow?: boolean } = {}): string {
  const phrase = spokenPunctuation(flow ? raw.trim().replace(/[.!?]+$/, "") : raw);
  if (!phrase) return current;
  if (flow) {
    if (!current.trim()) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    return `${current.replace(/\s+$/, "")} ${phrase}`;
  }
  const sentence = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  if (!current.trim()) return sentence;
  return `${current.replace(/\s+$/, "")}${/[.!?]$/.test(current.trim()) ? " " : ". "}${sentence}`;
}
