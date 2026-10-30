import type { HealTarget } from "@/lib/heal-targets";

/**
 * Meine Tierarten (docs/module.md): the targets left after the account's
 * choice. The human always stays; the target on screen (e.g. from a shared
 * link) stays too, so the page never loses what it shows.
 */
export function visibleTargets<T extends { key: HealTarget }>(
  all: readonly T[],
  hidden: readonly string[],
  current?: HealTarget,
): T[] {
  return all.filter((t) => t.key === "human" || t.key === current || !hidden.includes(t.key));
}

/** Hide a kind or show it again; the list keeps each kind once. */
export function toggleAnimal(hidden: readonly string[], key: string): string[] {
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}
