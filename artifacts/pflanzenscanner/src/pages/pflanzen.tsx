/**
 * /pflanzen — parent page holding the two plant sub-sections as tabs.
 * Reads ?tab=archiv|arten and ?kat=<ViewCategory> from the URL so the
 * back-button on the plant detail page can deep-link into the right tab and
 * category. The params are consumed once on mount; tab switching after that
 * is handled by local state.
 */
import { useState, useEffect } from "react";
import { BookOpen, Layers } from "lucide-react";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { VIEW_CATEGORIES, type ViewCategory } from "@/lib/view-categories";
import ArchivePage from "./archive";
import CategoriesPage from "./categories";

type Tab = "archiv" | "arten";

export default function PflanzenPage() {
  const search = useSearch();

  // Derive initial values from query params (consumed once on first render).
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab");
  const katParam = params.get("kat");

  const initialTab: Tab =
    tabParam === "arten" || tabParam === "archiv" ? tabParam : "archiv";

  // Legacy bookmarks: the former mushroom split categories map to "mushroom".
  const normalizedKat =
    katParam === "mushroom_edible" || katParam === "mushroom_poisonous"
      ? "mushroom"
      : katParam;

  const initialKat: ViewCategory | null =
    normalizedKat && (VIEW_CATEGORIES as readonly string[]).includes(normalizedKat)
      ? (normalizedKat as ViewCategory)
      : null;

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // If the URL changes (e.g. browser back/forward), keep tab in sync.
  useEffect(() => {
    const p = new URLSearchParams(search);
    const t = p.get("tab");
    if (t === "arten" || t === "archiv") setActiveTab(t);
  }, [search]);

  return (
    <div className="flex flex-col flex-1">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4">
        <div className="flex gap-0 max-w-2xl mx-auto">
          <TabButton
            active={activeTab === "archiv"}
            onClick={() => setActiveTab("archiv")}
            icon={BookOpen}
            label="Archiv"
          />
          <TabButton
            active={activeTab === "arten"}
            onClick={() => setActiveTab("arten")}
            icon={Layers}
            label="Arten"
          />
        </div>
      </div>

      {/* Tab content — render both but hide the inactive one so each component
          keeps its scroll position and internal state between tab switches. */}
      <div className={activeTab === "archiv" ? "flex flex-col flex-1" : "hidden"}>
        <ArchivePage />
      </div>
      <div className={activeTab === "arten" ? "flex flex-col flex-1" : "hidden"}>
        <CategoriesPage initialCategory={initialKat} />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
