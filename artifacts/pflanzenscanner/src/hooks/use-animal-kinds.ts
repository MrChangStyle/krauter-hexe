import { useGetSettings } from "@workspace/api-client-react";
import { HEAL_TARGETS, type HealTarget } from "@/lib/heal-targets";
import { visibleTargets } from "@/lib/animal-kinds";

/**
 * Meine Tierarten (docs/module.md): the targets "Essbar für" and the
 * Kräuter-Hexe offer. While the settings load (or offline) every kind shows.
 */
export function useHealTargets(current?: HealTarget) {
  const settings = useGetSettings();
  const hidden = settings.data?.hiddenAnimals ?? [];
  return { hidden, targets: visibleTargets(HEAL_TARGETS, hidden, current) };
}
