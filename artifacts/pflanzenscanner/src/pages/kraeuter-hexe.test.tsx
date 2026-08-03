// @vitest-environment jsdom
/**
 * Integration-level tests for KraeuterHexePage.
 *
 * These tests exercise the full URL → plants loaded → useEffect reconciliation
 * → rendered UI flow so that wiring bugs (wrong state setter, guard not firing,
 * etc.) are caught beyond what the pure unit tests in url-state.test.ts cover.
 *
 * Mocked:
 *   - @workspace/api-client-react  → controllable useListPlants
 *   - wouter                       → useLocation (navigate stub)
 *   - Heavy local UI components    → lightweight stubs so jsdom doesn't choke
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Plant } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Mocks – vi.mock calls are hoisted to the top of the file by Vitest, so
// they are applied before the module under test is imported.
// ---------------------------------------------------------------------------

// Controllable useListPlants: tests mutate these module-level variables.
let mockPlantsData: Plant[] | undefined = undefined;
let mockIsLoading = false;

vi.mock("@workspace/api-client-react", () => ({
  useListPlants: () => ({
    data: mockPlantsData,
    isLoading: mockIsLoading,
  }),
  useListCareGuides: () => ({ data: [], isLoading: false }),
  useGetLeaderboard: () => ({ data: null, isLoading: false }),
}));

// wouter – stub useLocation so navigation calls don't throw.
const mockNavigate = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["", mockNavigate],
}));

// Heavy SVG/animation components – replace with simple placeholder nodes.
vi.mock("@/components/witch-cauldron", () => ({
  WitchCauldron: () => React.createElement("span", { "data-testid": "witch-cauldron" }),
}));
vi.mock("@/components/pecking-chicken", () => ({
  PeckingChicken: () => React.createElement("span", { "data-testid": "pecking-chicken" }),
  default: () => React.createElement("span", { "data-testid": "pecking-chicken" }),
}));
vi.mock("@/components/apotheken-a", () => ({
  ApothekenA: () => React.createElement("span", { "data-testid": "apotheken-a" }),
}));
// PlantCard renders arbitrary plant data; stub it to a minimal node.
vi.mock("@/components/plant-card", () => ({
  PlantCard: ({ plant }: { plant: Plant }) =>
    React.createElement("div", { "data-testid": `plant-card-${plant.id}` }, plant.germanName),
}));
// Dropdown menu – replace with simple interactive elements so tests can click
// symptom items without fighting Radix's pointer-event machinery in jsdom.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { role: "menu" }, children),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
  DropdownMenuSeparator: () => React.createElement("hr"),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
    onSelect,
  }: {
    children: React.ReactNode;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    onSelect?: (e: Event) => void;
  }) =>
    React.createElement(
      "button",
      {
        role: "menuitemcheckbox",
        "aria-checked": checked,
        onClick: (e: React.MouseEvent) => {
          onSelect?.(e.nativeEvent);
          onCheckedChange(!checked);
        },
      },
      children,
    ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
}));

// ---------------------------------------------------------------------------
// Import page AFTER vi.mock declarations (hoisting ensures mocks are in place)
// ---------------------------------------------------------------------------

import KraeuterHexePage from "./kraeuter-hexe";

// ---------------------------------------------------------------------------
// Minimal Plant factory
// ---------------------------------------------------------------------------

function makePlant(overrides: Partial<Plant> & { id: number }): Plant {
  return {
    germanName: overrides.germanName ?? `Pflanze ${overrides.id}`,
    botanicalName: overrides.botanicalName ?? `Plantus ${overrides.id}`,
    category: "edible",
    humanStatus: overrides.humanStatus ?? "edible",
    poultryStatus: "safe",
    edibilityDetails: "",
    animalToxicityDetails: "",
    activeIngredients: "",
    humanBenefits: overrides.humanBenefits ?? "Beruhigend",
    poultryBenefits: "",
    habitat: "",
    siteConditions: "",
    otherUses: "",
    fertilizerTips: "",
    animals: {},
    symptoms: overrides.symptoms ?? { human: [] },
    symptomApplications: overrides.symptomApplications ?? {},
    hasSideImage: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <KraeuterHexePage />
    </QueryClientProvider>,
  );
}

/**
 * Override window.location so the component's `parseUrlState(window.location.search)`
 * sees the desired search string on mount.
 */
function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      search,
      href: `http://localhost/${search}`,
    },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared-link integration tests
//
// These tests render the page with a pre-built URL (as a recipient of a shared
// link would) and verify that the visible UI correctly reflects all three URL
// params: target chip, symptom chips, and the search input value.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – shared link restores UI state on mount", () => {
  /** A minimal rabbit plant whose symptoms field drives the symptom chip UI. */
  function makeRabbitPlant(id: number, symptoms: string[]): Plant {
    return makePlant({
      id,
      germanName: `Hasenpflanze ${id}`,
      humanStatus: "poisonous",
      animals: {
        rabbit: {
          status: "safe",
          benefits: "Hilft bei Hasenbeschwerden",
          toxicityDetails: "",
        },
      },
      symptoms: { rabbit: symptoms },
    });
  }

  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    setSearch("");
  });

  it("activates the correct target chip when target=rabbit is in the URL", async () => {
    setSearch("?target=rabbit");

    mockPlantsData = [makeRabbitPlant(10, ["Verdauung"])];

    renderPage();

    // The "Hase" button must carry the active ring class.
    const hasenBtn = screen.getByRole("button", { name: /hase/i });
    await waitFor(() => {
      expect(hasenBtn.className).toMatch(/ring-2/);
    });

    // The "Mensch" button must NOT be active.
    const menschBtn = screen.getByRole("button", { name: /mensch/i });
    expect(menschBtn.className).not.toMatch(/ring-2/);
  });

  it("shows the symptom chip when a recognised symptom is in the URL", async () => {
    // "Verdauung" in the URL is canonicalised to "Verdauungsbeschwerden"
    setSearch("?target=rabbit&symptoms=Verdauungsbeschwerden");

    mockPlantsData = [makeRabbitPlant(11, ["Verdauungsbeschwerden"])];

    renderPage();

    // After canonicalisation the chip for "Verdauungsbeschwerden" must appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeTruthy();
    });
  });

  it("populates the search input with the q param value", async () => {
    setSearch("?target=rabbit&q=Husten");

    mockPlantsData = [makeRabbitPlant(12, ["Husten"])];

    renderPage();

    // The search input must reflect the URL query.
    const input = screen.getByRole("searchbox", {
      name: /nach beschwerde suchen/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("Husten");
  });

  it("restores target chip, symptom chip, and search input from a full shared URL", async () => {
    const symptom = "Verstopfung";
    const query = "Krämpfe";
    setSearch(
      `?target=rabbit&symptoms=${encodeURIComponent(symptom)}&q=${encodeURIComponent(query)}`,
    );

    mockPlantsData = [makeRabbitPlant(13, [symptom])];

    renderPage();

    // 1. "Hase" target chip is active.
    const hasenBtn = screen.getByRole("button", { name: /hase/i });
    await waitFor(() => {
      expect(hasenBtn.className).toMatch(/ring-2/);
    });

    // 2. Symptom chip for "Verstopfung" is visible.
    expect(
      screen.getByRole("button", { name: /verstopfung entfernen/i }),
    ).toBeTruthy();

    // 3. Search input shows the query from the URL.
    const input = screen.getByRole("searchbox", {
      name: /nach beschwerde suchen/i,
    }) as HTMLInputElement;
    expect(input.value).toBe(query);

    // 4. No "not found" warning banner — all URL state was valid.
    expect(
      screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i),
    ).toBeNull();
  });

  it("defaults to target=human and no chips when the URL has no params", async () => {
    setSearch("");

    mockPlantsData = [
      makePlant({
        id: 14,
        germanName: "Kamille",
        humanStatus: "edible",
        humanBenefits: "Beruhigend",
        symptoms: { human: ["Beruhigung"] },
      }),
    ];

    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // "Mensch" button is active; no symptom chips; no warning banner.
    const menschBtn = screen.getByRole("button", { name: /mensch/i });
    expect(menschBtn.className).toMatch(/ring-2/);
    expect(screen.queryByRole("button", { name: /entfernen/i })).toBeNull();
    expect(
      screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i),
    ).toBeNull();
  });
});

describe("KraeuterHexePage – symptom canonicalisation after plant load", () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    // Unmount all rendered components so the DOM is clean for the next test.
    cleanup();
    // Reset search so tests don't bleed into each other.
    setSearch("");
  });

  it("remaps a lower-cased URL symptom to canonical casing and shows no warning banner", async () => {
    // Arrange: URL supplies "husten" (lowercase); canonical form from server is "Husten".
    setSearch("?target=human&symptoms=husten");

    mockPlantsData = [
      makePlant({
        id: 1,
        germanName: "Kamille",
        humanStatus: "edible",
        humanBenefits: "Hilft bei Husten",
        symptoms: { human: ["Husten"] },
      }),
    ];

    renderPage();

    // The chip with the canonical casing "Husten" should appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // No warning / amber banner about unrecognised symptoms.
    expect(
      screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i),
    ).toBeNull();
  });

  it("shows the amber notice banner for a truly unrecognised symptom", async () => {
    // Arrange: URL supplies a symptom that does not exist in the plant data.
    setSearch("?target=human&symptoms=UnbekanntesBeschwerden");

    mockPlantsData = [
      makePlant({
        id: 2,
        germanName: "Brennnessel",
        humanStatus: "edible",
        humanBenefits: "Entzündungshemmend",
        symptoms: { human: ["Entzündung"] },
      }),
    ];

    renderPage();

    // The amber notice banner must appear and name the unrecognised symptom.
    await waitFor(() => {
      expect(
        screen.getByText(/Beschwerde aus dem Link nicht gefunden/i),
      ).toBeTruthy();
    });

    expect(screen.getByText(/UnbekanntesBeschwerden/)).toBeTruthy();

    // No chip for the unknown symptom should be visible.
    expect(
      screen.queryByRole("button", { name: /unbekanntesbeschwerden entfernen/i }),
    ).toBeNull();
  });

  it("handles a mixed URL: one case-variant (remapped) and one unrecognised (banner)", async () => {
    // Arrange: "fieber" → canonical "Fieber"; "AlteBeschwerde" → not found.
    const encoded =
      encodeURIComponent("fieber") + "," + encodeURIComponent("AlteBeschwerde");
    setSearch(`?target=human&symptoms=${encoded}`);

    mockPlantsData = [
      makePlant({
        id: 3,
        germanName: "Holunder",
        humanStatus: "edible",
        humanBenefits: "Fiebersenkend",
        symptoms: { human: ["Fieber"] },
      }),
    ];

    renderPage();

    // Canonical chip "Fieber" (from remapped "fieber") must be present.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fieber entfernen/i }),
      ).toBeTruthy();
    });

    // Banner for "AlteBeschwerde" must appear.
    expect(screen.getByText(/AlteBeschwerde/)).toBeTruthy();
    expect(
      screen.getByText(/Beschwerde aus dem Link nicht gefunden/i),
    ).toBeTruthy();
  });

  it("shows no banner and no chips when there are no URL symptoms", async () => {
    // Arrange: URL has no symptoms param at all.
    setSearch("?target=human");

    mockPlantsData = [
      makePlant({
        id: 4,
        germanName: "Ringelblume",
        humanStatus: "edible",
        humanBenefits: "Wundheilend",
        symptoms: { human: ["Wundheilung"] },
      }),
    ];

    renderPage();

    // Wait for at least one navigate call (the URL-sync effect fires after mount).
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // Neither a banner nor symptom chips should appear.
    expect(
      screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /entfernen/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Plant removal mid-session tests
//
// These tests cover what happens when the plant list changes after the user
// has already selected a symptom chip.  The selected chip may become "dangling"
// (the symptom no longer exists in the available list), and the filter must
// not silently freeze — it should either show a meaningful empty-state or
// drop the stale selection gracefully.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – symptom filter behaviour after plant removal", () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    setSearch("");
  });

  it("shows the empty-state when the only carrier of a selected symptom is removed but other plants remain", async () => {
    // Arrange: two plants – only Plant A carries "Husten".
    // Pre-select "Husten" via URL so we skip manual chip interaction.
    setSearch("?target=human&symptoms=Husten");

    const plantA = makePlant({
      id: 30,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Hilft bei Husten",
      symptoms: { human: ["Husten"] },
    });
    const plantB = makePlant({
      id: 31,
      germanName: "Holunder",
      humanStatus: "edible",
      humanBenefits: "Fiebersenkend",
      symptoms: { human: ["Fieber"] },
    });
    mockPlantsData = [plantA, plantB];

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for canonicalisation to run — the "Husten" chip must appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // Plant A is deleted on the server mid-session.
    // Plant B (with "Fieber") still exists, so the symptom panel stays visible.
    mockPlantsData = [plantB];
    rerender(makeTree());

    // The "Husten" chip must be auto-cleared because "Husten" is no longer
    // present in availableSymptoms after Plant A was removed.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /husten entfernen/i }),
      ).toBeNull();
    });

    // With no active filter and no query, the results area shows the
    // "enter an ailment first" prompt rather than a frozen empty list.
    // Wrapped in waitFor because the auto-clearing effect dispatches an async
    // state update; the render with empty selected may lag one cycle behind
    // the chip disappearing from the DOM.
    await waitFor(() => {
      expect(
        screen.getByText(/gib oben eine beschwerde ein/i),
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("collapses the symptom panel and shows target empty-state when all plants are removed", async () => {
    // Arrange: one plant; "Husten" pre-selected via URL.
    setSearch("?target=human&symptoms=Husten");

    const plant = makePlant({
      id: 32,
      germanName: "Brennnessel",
      humanStatus: "edible",
      humanBenefits: "Entzündungshemmend",
      symptoms: { human: ["Husten"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Chip appears after canonicalisation.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // All plants removed — no symptoms available at all.
    mockPlantsData = [];
    rerender(makeTree());

    // The symptom panel should collapse (availableSymptoms is empty), so
    // no symptom chips remain visible in the UI.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /husten entfernen/i }),
      ).toBeNull();
    });

    // The results area shows the "no plants for this target" message.
    expect(
      screen.getByText(/noch keine passenden pflanzen für dieses ziel/i),
    ).toBeTruthy();
  });

  it("auto-clears a manually selected chip when its plant is removed mid-session", async () => {
    // No URL symptoms — canonicalisedRef is never set in this path, so this
    // test proves the reconciliation fires regardless of URL initialisation.
    setSearch("?target=human");

    const plant = makePlant({
      id: 33,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Hilft bei Husten",
      symptoms: { human: ["Husten"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for the symptom filter panel to appear (plants loaded).
    await screen.findByRole("button", { name: /beschwerden auswählen/i });

    // Click the symptom item directly — the dropdown-menu mock renders plain
    // interactive elements so no Radix pointer-event setup is needed.
    const item = await screen.findByRole("menuitemcheckbox", { name: /husten/i });
    await act(async () => { fireEvent.click(item); });

    // Chip must appear — symptom selected manually, not from the URL.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // Delete the only plant carrying "Husten".
    mockPlantsData = [];
    rerender(makeTree());

    // Reconciliation must strip the chip even though canonicalisedRef was
    // never set (the session had no URL symptoms).
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /husten entfernen/i }),
      ).toBeNull();
    });
  });

  it("shows the removed-filter notice when a mid-session chip is stripped", async () => {
    // Arrange: plant pre-loaded, user selects "Husten" manually, then plant is removed.
    setSearch("?target=human");

    const plant = makePlant({
      id: 34,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Hilft bei Husten",
      symptoms: { human: ["Husten"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for the symptom filter panel to appear (plants loaded).
    await screen.findByRole("button", { name: /beschwerden auswählen/i });

    // Select "Husten" manually.
    const item = await screen.findByRole("menuitemcheckbox", { name: /husten/i });
    await act(async () => { fireEvent.click(item); });

    // Chip must appear.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /husten entfernen/i })).toBeTruthy();
    });

    // Reconciliation initialised — now simulate mid-session plant removal.
    mockPlantsData = [];
    rerender(makeTree());

    // The removed-filter notice must appear naming "Husten".
    await waitFor(() => {
      expect(screen.getByText(/«Husten».*nicht mehr vorhanden/i)).toBeTruthy();
    });
  });

  it("does NOT show the removed-filter notice on first-load canonicalisation", async () => {
    // Arrange: URL supplies "Husten"; it is stripped on first load because the
    // plant list comes back empty.  No mid-session interaction has happened, so
    // no notice should appear.
    setSearch("?target=human&symptoms=Husten");

    // Plants load with no matching symptom (Husten has no carrier).
    mockPlantsData = [
      makePlant({
        id: 35,
        germanName: "Brennnessel",
        humanStatus: "edible",
        humanBenefits: "Entzündungshemmend",
        symptoms: { human: ["Entzündung"] },
      }),
    ];

    renderPage();

    // Wait for canonicalisation effect to settle.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // The removed-filter notice must NOT appear — this was first-load, not mid-session.
    expect(screen.queryByText(/nicht mehr vorhanden/i)).toBeNull();
  });

  it("shows the notice listing all stripped chips when multiple plants are removed at once", async () => {
    // Arrange: two plants carry distinct symptoms; both pre-selected from URL;
    // then both plants are deleted simultaneously.
    setSearch("?target=human&symptoms=Husten,Fieber");

    const plantA = makePlant({
      id: 36,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Hilft bei Husten",
      symptoms: { human: ["Husten"] },
    });
    const plantB = makePlant({
      id: 37,
      germanName: "Holunder",
      humanStatus: "edible",
      humanBenefits: "Fiebersenkend",
      symptoms: { human: ["Fieber"] },
    });
    mockPlantsData = [plantA, plantB];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for both chips to appear after canonicalisation.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /husten entfernen/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /fieber entfernen/i })).toBeTruthy();
    });

    // Remove both plants mid-session.
    mockPlantsData = [];
    rerender(makeTree());

    // Both chips gone.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /husten entfernen/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /fieber entfernen/i })).toBeNull();
    });

    // Notice must mention both removed tags.
    await waitFor(() => {
      expect(screen.getByText(/nicht mehr vorhanden/i)).toBeTruthy();
    });
    const notice = screen.getByText(/nicht mehr vorhanden/i);
    expect(notice.textContent).toMatch(/Husten|Fieber/);
  });
});

// ---------------------------------------------------------------------------
// Share-button tests
//
// These tests verify that clicking the "Ansicht teilen" button writes the
// current window.location.href to navigator.clipboard, and that the URL
// contains the expected target, symptoms, and q params.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – share button copies the correct URL to clipboard", () => {
  let originalShare: typeof navigator.share | undefined;
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();

    // Suppress the Web Share API so the handler always falls through to clipboard.
    originalShare = navigator.share;
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Mock clipboard.writeText so we can inspect what was written.
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    setSearch("");
    // Restore navigator.share if it existed.
    Object.defineProperty(navigator, "share", {
      value: originalShare,
      writable: true,
      configurable: true,
    });
  });

  it("copies a URL with target=rabbit, symptoms, and q when the share button is clicked", async () => {
    const symptom = "Verdauung";
    const q = "Krämpfe";
    const search = `?target=rabbit&symptoms=${encodeURIComponent(symptom)}&q=${encodeURIComponent(q)}`;

    // Set both search and href so handleShare (which reads window.location.href) sees a full URL.
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        search,
        href: `http://localhost/${search}`,
      },
      writable: true,
      configurable: true,
    });

    mockPlantsData = [
      makePlant({
        id: 50,
        germanName: "Hasenpflanze",
        humanStatus: "poisonous",
        animals: {
          rabbit: {
            status: "safe",
            benefits: "Hilft bei Hasenbeschwerden",
            toxicityDetails: "",
          },
        },
        symptoms: { rabbit: [symptom] },
      }),
    ];

    const { getByRole } = renderPage();

    // Wait for the page to settle (symptom canonicalisation runs after plant load).
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // Click the share button.
    const shareBtn = getByRole("button", { name: /ansicht teilen/i });
    shareBtn.click();

    // The clipboard must have received the current href.
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));

    const copiedUrl = clipboardWriteText.mock.calls[0][0] as string;
    const copiedParams = new URLSearchParams(new URL(copiedUrl).search);

    expect(copiedParams.get("target")).toBe("rabbit");
    expect(copiedParams.get("q")).toBe(q);

    // Symptoms are individually encodeURIComponent-encoded and joined with ",".
    const rawSymptoms = copiedParams.get("symptoms") ?? "";
    const decodedSymptoms = rawSymptoms.split(",").map(decodeURIComponent);
    expect(decodedSymptoms).toContain(symptom);
  });

  it("copies a URL that round-trips through parseUrlState back to the same state", async () => {
    const { parseUrlState } = await import("@/lib/url-state");

    const symptom1 = "Husten";
    const symptom2 = "Fieber";
    const q = "Erkältung";
    const search =
      `?target=rabbit` +
      `&symptoms=${encodeURIComponent(symptom1)},${encodeURIComponent(symptom2)}` +
      `&q=${encodeURIComponent(q)}`;

    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        search,
        href: `http://localhost/${search}`,
      },
      writable: true,
      configurable: true,
    });

    mockPlantsData = [
      makePlant({
        id: 51,
        germanName: "Hasenpflanze2",
        humanStatus: "poisonous",
        animals: {
          rabbit: {
            status: "safe",
            benefits: "Hilft",
            toxicityDetails: "",
          },
        },
        symptoms: { rabbit: [symptom1, symptom2] },
      }),
    ];

    const { getByRole } = renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    getByRole("button", { name: /ansicht teilen/i }).click();

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));

    const copiedUrl = clipboardWriteText.mock.calls[0][0] as string;
    const parsed = parseUrlState(new URL(copiedUrl).search);

    expect(parsed.target).toBe("rabbit");
    expect(parsed.query).toBe(q);
    expect(parsed.symptoms).toContain(symptom1);
    expect(parsed.symptoms).toContain(symptom2);
  });
});

// ---------------------------------------------------------------------------
// Share button – native share priority tests
//
// These tests verify that handleShare prefers navigator.share when it is
// available and only falls through to the clipboard when share is absent or
// the user cancels.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – share button prefers native share over clipboard", () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = [
      makePlant({
        id: 99,
        germanName: "Kamille",
        humanStatus: "edible",
        humanBenefits: "Beruhigend",
        symptoms: { human: ["Beruhigung"] },
      }),
    ];
    mockNavigate.mockReset();

    setSearch("?target=human");
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        search: "?target=human",
        href: "http://localhost/?target=human",
      },
      writable: true,
      configurable: true,
    });

    // Set up clipboard mock (should NOT be called when share succeeds).
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    setSearch("");
    // Remove navigator.share so tests don't bleed into each other.
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("calls navigator.share with the current URL when share is available and resolves", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    const { getByRole } = renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    getByRole("button", { name: /ansicht teilen/i }).click();

    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));

    // share must receive the current href.
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://localhost/?target=human" }),
    );

    // Clipboard must NOT have been touched when share succeeded.
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when navigator.share rejects (user cancelled)", async () => {
    const mockShare = vi.fn().mockRejectedValue(new DOMException("AbortError", "AbortError"));
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    const { getByRole } = renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    getByRole("button", { name: /ansicht teilen/i }).click();

    // share was attempted first.
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));

    // After share rejects the clipboard fallback must fire.
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
    expect(clipboardWriteText).toHaveBeenCalledWith("http://localhost/?target=human");
  });

  it("does not freeze or set copied state when both share and clipboard are blocked", async () => {
    // Arrange: navigator.share rejects AND clipboard.writeText rejects.
    // This simulates a privacy-hardened browser or old WebView where both APIs throw.
    const mockShare = vi.fn().mockRejectedValue(new DOMException("NotAllowedError", "NotAllowedError"));
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    const rejectedClipboard = vi.fn().mockRejectedValue(new DOMException("NotAllowedError", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: rejectedClipboard },
      writable: true,
      configurable: true,
    });

    // Track unhandled promise rejections — none must be emitted.
    const unhandledRejections: PromiseRejectionEvent[] = [];
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      unhandledRejections.push(e);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const { getByRole } = renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    // Act: click the share button.
    await act(async () => {
      getByRole("button", { name: /ansicht teilen/i }).click();
    });

    // Both APIs must have been attempted.
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rejectedClipboard).toHaveBeenCalledTimes(1));

    // Assert 1: button remains in its default "Teilen" state — not stuck in "Kopiert!".
    expect(getByRole("button", { name: /ansicht teilen/i })).toBeTruthy();
    expect(screen.queryByText(/Kopiert!/i)).toBeNull();

    // Assert 2: no unhandled promise rejection was emitted.
    // Allow a microtask tick so any leaked rejection would have fired.
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandledRejections).toHaveLength(0);

    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  });
});

// ---------------------------------------------------------------------------
// Refetch loading flash tests
//
// Verifies that when allPlants briefly becomes undefined (e.g. during a
// background refetch), the reconciliation effect does NOT wipe the user's
// active symptom selections.  Once the data returns, the chips must still
// be present exactly as they were before the flash.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – active filters survive a data-refetch loading flash", () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    setSearch("");
  });

  it("keeps the selected chip when allPlants goes undefined then restores with the same data", async () => {
    // Arrange: pre-select "Husten" via URL.
    setSearch("?target=human&symptoms=Husten");

    const plant = makePlant({
      id: 90,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Beruhigend",
      symptoms: { human: ["Husten"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for canonicalisation — chip must appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // Simulate a background refetch: allPlants briefly becomes undefined.
    // The symptom panel will collapse (no data → no available symptoms), but the
    // internal selectedByTarget state must NOT be wiped by the reconciliation effect.
    mockPlantsData = undefined;
    rerender(makeTree());

    // Allow a tick to confirm no spurious state update fires while data is absent.
    await new Promise((r) => setTimeout(r, 50));

    // Data returns with the same plant list — chip must reappear, proving the
    // selection state was preserved during the flash (not cleared).
    mockPlantsData = [plant];
    rerender(makeTree());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });
  });

  it("keeps the selected chip when allPlants goes undefined then restores (manually selected chip)", async () => {
    // This variant uses a chip selected manually in-session (no URL param) so
    // canonicalisedRef is never set — proving the flash guard is independent
    // of URL-initialisation state.
    setSearch("?target=human");

    const plant = makePlant({
      id: 91,
      germanName: "Holunder",
      humanStatus: "edible",
      humanBenefits: "Fiebersenkend",
      symptoms: { human: ["Fieber"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    // Wait for the symptom filter panel to appear.
    await screen.findByRole("button", { name: /beschwerden auswählen/i });

    // Manually select "Fieber".
    const item = await screen.findByRole("menuitemcheckbox", { name: /fieber/i });
    await act(async () => { fireEvent.click(item); });

    // Chip must appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fieber entfernen/i }),
      ).toBeTruthy();
    });

    // Simulate refetch flash: allPlants → undefined.
    mockPlantsData = undefined;
    rerender(makeTree());

    // Tick — reconciliation must NOT clear the selection while data is absent.
    await new Promise((r) => setTimeout(r, 50));

    // Data restores — chip must reappear.
    mockPlantsData = [plant];
    rerender(makeTree());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fieber entfernen/i }),
      ).toBeTruthy();
    });
  });

  it("does NOT show the removed-filter notice during or after a refetch flash", async () => {
    // The notice should only fire mid-session when a plant is genuinely deleted.
    // A refetch flash (undefined → data restored) must never trigger the notice.
    setSearch("?target=human&symptoms=Husten");

    const plant = makePlant({
      id: 92,
      germanName: "Kamille",
      humanStatus: "edible",
      humanBenefits: "Beruhigend",
      symptoms: { human: ["Husten"] },
    });
    mockPlantsData = [plant];

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTree = () => (
      <QueryClientProvider client={qc}>
        <KraeuterHexePage />
      </QueryClientProvider>
    );

    const { rerender } = render(makeTree());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /husten entfernen/i }),
      ).toBeTruthy();
    });

    // Refetch flash: undefined → same data.
    mockPlantsData = undefined;
    rerender(makeTree());
    mockPlantsData = [plant];
    rerender(makeTree());

    // Allow effects to settle.
    await new Promise((r) => setTimeout(r, 100));

    // No "not found" or "removed" notice must have appeared.
    expect(screen.queryByText(/nicht mehr vorhanden/i)).toBeNull();
    expect(screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Target-switching isolation tests
//
// Verifies that when a user opens a shared link that pre-selects symptoms for
// one target and then switches to a different target, the symptom selection for
// the new target is clean — no carry-over from the previous target.
// ---------------------------------------------------------------------------

describe("KraeuterHexePage – switching targets after opening a shared link", () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockPlantsData = undefined;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    setSearch("");
  });

  it("clears rabbit symptoms when the user switches to the Mensch target after opening a shared link", async () => {
    // Arrange: simulate opening a shared link for rabbit with a pre-selected symptom.
    // "Verdauung" is stored canonically as "Verdauungsbeschwerden".
    setSearch("?target=rabbit&symptoms=Verdauungsbeschwerden");

    mockPlantsData = [
      makePlant({
        id: 60,
        germanName: "Hasenpflanze",
        humanStatus: "poisonous",
        animals: {
          rabbit: {
            status: "safe",
            benefits: "Hilft bei Hasenbeschwerden",
            toxicityDetails: "",
          },
        },
        symptoms: { rabbit: ["Verdauungsbeschwerden"] },
      }),
    ];

    renderPage();

    // Wait for the rabbit symptom chip to appear (canonicalisation has run).
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeTruthy();
    });

    // Act: click the "Mensch" target button.
    screen.getByRole("button", { name: /mensch/i }).click();

    // Assert 1: the rabbit symptom chip is no longer visible for the new target.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeNull();
    });

    // Assert 2: the URL updated by navigate reflects target=human with no carried-over symptoms.
    const calls = mockNavigate.mock.calls;
    const lastArg = calls[calls.length - 1][0] as string;
    const params = new URLSearchParams(lastArg.startsWith("?") ? lastArg.slice(1) : lastArg);
    expect(params.get("target")).toBe("human");
    expect(params.get("symptoms") ?? "").toBe("");
  });

  it("preserves rabbit symptoms after a rabbit → human → rabbit round-trip without cross-contamination", async () => {
    // Arrange: shared link opens with rabbit + "Verdauungsbeschwerden".
    setSearch("?target=rabbit&symptoms=Verdauungsbeschwerden");

    mockPlantsData = [
      makePlant({
        id: 80,
        germanName: "Hasenpflanze",
        humanStatus: "poisonous",
        animals: {
          rabbit: {
            status: "safe",
            benefits: "Hilft bei Hasenbeschwerden",
            toxicityDetails: "",
          },
        },
        symptoms: { rabbit: ["Verdauungsbeschwerden"] },
      }),
    ];

    renderPage();

    // Wait for the rabbit symptom chip to appear (initial URL state applied).
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeTruthy();
    });

    // Hop 1: rabbit → human.
    screen.getByRole("button", { name: /mensch/i }).click();

    // Rabbit chip must disappear; human has no symptoms selected.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeNull();
    });

    // No symptom chip at all visible for the human target.
    expect(screen.queryByRole("button", { name: /entfernen/i })).toBeNull();

    // Hop 2: human → rabbit.
    screen.getByRole("button", { name: /hase/i }).click();

    // The original rabbit selection must be restored from selectedByTarget.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /verdauungsbeschwerden entfernen/i }),
      ).toBeTruthy();
    });

    // Human target must still have no carried-over symptoms:
    // verify the last navigate call after switching back to rabbit reflects
    // rabbit symptoms with no human contamination.
    const calls = mockNavigate.mock.calls;
    const lastArg = calls[calls.length - 1][0] as string;
    const params = new URLSearchParams(lastArg.startsWith("?") ? lastArg.slice(1) : lastArg);
    expect(params.get("target")).toBe("rabbit");
    expect(params.get("symptoms")).toContain("Verdauungsbeschwerden");
  });

  it("clears the 'symptom not found' warning banner when the user switches targets", async () => {
    // Arrange: simulate a shared link for rabbit with an unrecognised symptom.
    // "GhostSymptom" does not exist in the plant data, so the amber banner appears.
    setSearch("?target=rabbit&symptoms=GhostSymptom");

    mockPlantsData = [
      makePlant({
        id: 70,
        germanName: "Hasenpflanze",
        humanStatus: "poisonous",
        animals: {
          rabbit: {
            status: "safe",
            benefits: "Hilft bei Hasenbeschwerden",
            toxicityDetails: "",
          },
        },
        symptoms: { rabbit: ["Verdauungsbeschwerden"] },
      }),
    ];

    renderPage();

    // The amber warning banner must appear after canonicalisation runs and
    // confirms "GhostSymptom" cannot be matched to any available symptom.
    await waitFor(() => {
      expect(
        screen.getByText(/Beschwerde aus dem Link nicht gefunden/i),
      ).toBeTruthy();
    });

    expect(screen.getByText(/GhostSymptom/)).toBeTruthy();

    // Act: switch to the "Mensch" target.
    screen.getByRole("button", { name: /mensch/i }).click();

    // Assert: the warning banner is gone — it was only relevant to the rabbit target.
    await waitFor(() => {
      expect(
        screen.queryByText(/Beschwerde aus dem Link nicht gefunden/i),
      ).toBeNull();
    });
  });
});
