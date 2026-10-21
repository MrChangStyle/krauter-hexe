import { useGetSettings } from "@workspace/api-client-react";
import { moduleVisible } from "@/lib/modules";
import type { ModuleId } from "@workspace/api-client-react";

/** The account's module choice; while it loads (or offline) everything shows. */
export function useModules() {
  const settings = useGetSettings();
  const hidden = settings.data?.hiddenModules ?? [];
  return { settings, hidden, visible: (id: ModuleId) => moduleVisible(hidden, id) };
}
