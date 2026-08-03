import type { Plant } from "@workspace/api-client-react";
import { getAnimalInfo, type AnimalKey } from "@/lib/animals";

// ---------------------------------------------------------------------------
// Human safety badge
// ---------------------------------------------------------------------------

export interface HumanBadge {
  safe: boolean;
  /** Display label shown in the badge */
  label: string;
}

/**
 * The authoritative human-safety display state for a plant.
 *
 * Mushrooms (category === "mushroom") require both the edible status AND a
 * confirmed side photo before "Essbar" is shown — this mirrors the SQL-level
 * gate so the UI never renders a green badge for an unconfirmed mushroom even
 * if data somehow slips through.
 *
 * All other plants rely solely on humanStatus.
 */
export function humanBadge(
  plant: Pick<Plant, "humanStatus" | "hasSideImage" | "category">,
): HumanBadge {
  const safe =
    plant.category === "mushroom"
      ? mushroomEdibleForDisplay(plant)
      : plant.humanStatus === "edible";
  return { safe, label: safe ? "Ungiftig" : "GIFTIG" };
}

// ---------------------------------------------------------------------------
// Animal safety card
// ---------------------------------------------------------------------------

export type AnimalCardVariant = "safe" | "toxic" | "pending";

export interface AnimalBadge {
  variant: AnimalCardVariant;
  /** Display label shown in the card */
  label: string;
}

/** Returns the animal-safety display state for the chosen animal. */
export function animalBadge(plant: Plant, key: AnimalKey): AnimalBadge {
  const info = getAnimalInfo(plant, key);
  if (!info) return { variant: "pending", label: "Wird ergänzt …" };
  if (info.status === "safe") return { variant: "safe", label: "Genießbar" };
  return { variant: "toxic", label: "GIFTIG" };
}

/** CSS card class derived from the animal badge variant. */
export function animalCardClass(variant: AnimalCardVariant): string {
  if (variant === "safe")
    return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30";
  if (variant === "toxic")
    return "bg-rose-50 border-rose-200 dark:bg-rose-950/30";
  return "bg-muted/40 border-border";
}

// ---------------------------------------------------------------------------
// Mushroom two-photo edibility gate
// ---------------------------------------------------------------------------

/**
 * Returns true only when a mushroom may be displayed as "Essbar": the plant
 * must be categorised as a mushroom, carry the human edible status, AND have
 * the confirmed side photo (the second shot of the two-photo mushroom scan).
 *
 * The SQL selection enforces this write-time too (CASE expression), but we
 * replicate the check here so the frontend never shows an edible badge for an
 * unconfirmed mushroom regardless of data anomalies.
 *
 * Used internally by humanBadge; exported for direct unit testing.
 */
export function mushroomEdibleForDisplay(
  plant: Pick<Plant, "humanStatus" | "hasSideImage" | "category">,
): boolean {
  return (
    plant.category === "mushroom" &&
    plant.humanStatus === "edible" &&
    !!plant.hasSideImage
  );
}
