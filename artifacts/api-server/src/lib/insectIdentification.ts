import { ai } from "./geminiClient";
import { coerceQuality } from "./imageQualityPolicy";
import {
  INSECT_CATEGORIES,
  INSECT_RELATION_STATUSES,
  type InsectCategory,
  type InsectRelationStatus,
} from "@workspace/db";

export interface InsectIdentification {
  /** False when the photo contains no recognisable insect / arthropod. */
  istInsekt: boolean;
  germanName: string;
  scientificName: string;
  category: InsectCategory;
  relationStatus: InsectRelationStatus;
  /** Plant species this insect frequently targets or visits (German common names). */
  affectedPlants: string[];
  /** German-language description: appearance, habitat, lifecycle. */
  description: string;
  /**
   * For pests: organic / biological treatment and prevention tips (German).
   * Empty string for beneficial and neutral insects.
   */
  treatmentTips: string;
  /**
   * If the photo shows an insect on a recognisable plant, the German common
   * name of that plant. Null when no host plant is visible.
   */
  plantContext: string | null;
  /** Photo rating 1-10 (see imageQualityPolicy); null when not given. */
  imageQuality: number | null;
}

const SYSTEM_PROMPT = `Du bist ein Entomologe und Biologe, der Insekten und andere Gliedertiere (Arthropoden) anhand von Fotos bestimmt.

WICHTIG – Was als Insekt/Arthropode gilt (istInsekt = true):
• Alle Insekten: Käfer, Schmetterlinge, Raupen, Larven, Puppen, Bienen, Wespen, Hummeln, Ameisen, Fliegen, Mücken, Wanzen, Zikaden, Heuschrecken, Grillen, Ohrwürmer, Libellen, Läuse, Flöhe, Silberfischchen, Schaben u.v.m.
• Spinnentiere: Spinnen, Milben, Zecken, Weberknechte, Skorpione
• Tausendfüßer und Hundertfüßer (Myriapoden)
• Krebstiere: Asseln und ähnliche
• Eier, Kokons, Gespinste, Fraßspuren – wenn eindeutig einem Arthropoden zuzuordnen
• Auch bei unscharfen, kleinen oder teilweise sichtbaren Tieren: gib immer deine beste Einschätzung ab (istInsekt = true).

istInsekt = false NUR bei: Fotos ohne jedes Tier (Pflanzen, Erde, Gebäude, Menschen, leere Flächen), bei denen keinerlei Arthropode erkennbar oder erschließbar ist.

Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown):
{
  "istInsekt": boolean,
  "germanName": string (Trivialname auf Deutsch, z.B. "Siebenpunkt-Marienkäfer", "Gemeine Gartenspinne", "Große Raubfliege"; bei Larven/Eiern z.B. "Kohlweißling-Raupe"),
  "scientificName": string (lateinischer Artname oder Gattungsname, z.B. "Coccinella septempunctata"; "Unbekannt" nur wenn absolut nicht bestimmbar),
  "category": one of "beetle" | "butterfly" | "bee_wasp" | "fly_mosquito" | "bug_cicada" | "grasshopper" | "dragonfly" | "spider_other"
    ("beetle"=Käfer inkl. Larven, "butterfly"=Schmetterlinge/Motten/Raupen, "bee_wasp"=Bienen/Wespen/Hummeln/Ameisen/Schwebfliegen, "fly_mosquito"=Fliegen/Mücken/Gnitzen, "bug_cicada"=Wanzen/Zikaden/Blattläuse/Schildläuse, "grasshopper"=Heuschrecken/Grillen/Ohrwürmer, "dragonfly"=Libellen/Eintagsfliegen, "spider_other"=Spinnen/Milben/Zecken/Asseln/Tausendfüßer/alle übrigen),
  "relationStatus": one of "pest" | "beneficial" | "neutral"
    ("pest"=schadet Nutzpflanzen oder Ernte direkt; "beneficial"=nützt dem Garten als Räuber, Bestäuber oder Zersetzer; "neutral"=weder Schaden noch Nutzen für Gartenpflanzen),
  "affectedPlants": string[] (Pflanzennamen auf Deutsch, die das Tier häufig befällt oder besucht; [] wenn keine spezifischen),
  "description": string (Deutsch, 3–5 Sätze: Aussehen, Lebensraum, Lebenszyklus, Verhalten; bei Larve/Ei auch Verwandlung erwähnen),
  "treatmentTips": string (NUR bei "pest": biologische/organische Bekämpfung auf Deutsch, 2–4 Sätze; sonst ""),
  "plantContext": string | null (Deutscher Name der Pflanze, auf der das Tier sitzt – nur wenn klar erkennbar; sonst null),
  "bildqualitaet": number (ganze Zahl 1-10: Wie gut eignet sich das Foto als Referenzbild der Art? Bewerte Schärfe, Licht, ob das Tier das Bild gut füllt und ob die typischen Erkennungsmerkmale gut sichtbar sind. 1 = unbrauchbar, 5 = durchschnittliches Handyfoto, 10 = Bestimmungsbuch-Qualität)
}
Gib bei Unsicherheit immer deine beste Schätzung ab. Ohne eindeutige Schädlichkeit → "neutral" oder "beneficial".`;

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function coerceText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, 20);
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL");
  return { mimeType: match[1], data: match[2] };
}

function parseJsonLoose(raw: string): unknown {
  const text = raw.trim();
  const unfenced =
    /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim() ?? text;
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("AI model returned invalid JSON");
  }
}

function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  const message = String((err as { message?: string } | null)?.message ?? "");
  return (
    status === 503 ||
    status === 429 ||
    /UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// For insects the more capable model is first – they're harder to identify
// than plants and the extra latency is worth the accuracy gain.
//
// timeoutMs: a single attempt that takes longer than this is abandoned and the
// next model is tried. Healthy answers arrive well within it; past it the
// model is usually overloaded and waiting longer only makes the user wait.
const MODELS: ReadonlyArray<ModelStep> = [
  { name: "gemini-flash-latest", attempts: 2, timeoutMs: 35_000 },
  { name: "gemini-flash-lite-latest", attempts: 1, timeoutMs: 40_000 },
];

interface ModelStep {
  name: string;
  attempts: number;
  timeoutMs: number;
}

/** Minimal logger shape (pino's req.log fits). */
export interface ScanLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

class AttemptTimeoutError extends Error {
  constructor(model: string, ms: number) {
    super(`AI model ${model} did not answer within ${ms} ms`);
    this.name = "AttemptTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, model: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AttemptTimeoutError(model, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const GENERATION_CONFIG = {
  maxOutputTokens: 4096,
  responseMimeType: "application/json",
} as const;

async function runModelChain(
  contents: unknown,
  models: ReadonlyArray<ModelStep>,
  log?: ScanLogger,
): Promise<unknown> {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < model.attempts; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: model.name,
            contents: contents as never,
            config: GENERATION_CONFIG,
          }),
          model.timeoutMs,
          model.name,
        );
        const raw = response.text;
        if (!raw) throw new Error("Empty response from AI model");
        const parsed = parseJsonLoose(raw);
        log?.info(
          { model: model.name, attempt: attempt + 1, aiMs: Date.now() - startedAt },
          "Insect AI answered",
        );
        return parsed;
      } catch (err) {
        lastError = err;
        const timedOut = err instanceof AttemptTimeoutError;
        log?.warn(
          {
            model: model.name,
            attempt: attempt + 1,
            aiMs: Date.now() - startedAt,
            timedOut,
            err: String((err as { message?: string } | null)?.message ?? err),
          },
          "Insect AI attempt failed",
        );
        // A timeout means the model is slow right now: go straight to the next
        // model instead of retrying the same one.
        if (!timedOut && isTransientError(err) && attempt < model.attempts - 1) {
          await sleep(800 * (attempt + 1));
        } else {
          break;
        }
      }
    }
  }
  throw lastError ?? new Error("AI request failed");
}

export const UNKNOWN_SCIENTIFIC_NAME = "Unbekannt";

export async function identifyInsect(
  imageDataUrl: string,
  log?: ScanLogger,
): Promise<InsectIdentification> {
  const { mimeType, data } = parseDataUrl(imageDataUrl);

  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `${SYSTEM_PROMPT}\n\nBestimme das Insekt auf diesem Foto und erstelle das Datenblatt als JSON.`,
        },
        { inlineData: { mimeType, data } },
      ],
    },
  ];

  const parsed = await runModelChain(contents, MODELS, log);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  // Coerce: some model responses return the string "true" instead of boolean.
  const istInsekt =
    obj.istInsekt === true ||
    (typeof obj.istInsekt === "string" &&
      obj.istInsekt.trim().toLowerCase() === "true");

  if (!istInsekt) {
    return {
      istInsekt: false,
      germanName: "Unbekannt",
      scientificName: UNKNOWN_SCIENTIFIC_NAME,
      category: "spider_other",
      relationStatus: "neutral",
      affectedPlants: [],
      description: "",
      treatmentTips: "",
      plantContext: null,
      imageQuality: null,
    };
  }

  const relationStatus = coerceEnum(
    obj.relationStatus,
    INSECT_RELATION_STATUSES,
    "neutral" as InsectRelationStatus,
  );

  return {
    istInsekt: true,
    germanName: coerceText(obj.germanName, "Unbekanntes Insekt"),
    scientificName: coerceText(obj.scientificName, UNKNOWN_SCIENTIFIC_NAME),
    category: coerceEnum(
      obj.category,
      INSECT_CATEGORIES,
      "spider_other" as InsectCategory,
    ),
    relationStatus,
    affectedPlants: coerceStringArray(obj.affectedPlants),
    description: coerceText(obj.description, "Keine Beschreibung verfügbar."),
    treatmentTips:
      relationStatus === "pest" ? coerceText(obj.treatmentTips, "") : "",
    plantContext:
      typeof obj.plantContext === "string" && obj.plantContext.trim().length > 0
        ? obj.plantContext.trim()
        : null,
    imageQuality: coerceQuality(obj.bildqualitaet),
  };
}
