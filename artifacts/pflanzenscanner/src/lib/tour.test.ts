import { describe, expect, it } from "vitest";
import { TOUR, readTourStep, setTourStep, subscribeTour, tourSteps } from "@/lib/tour";

describe("App-Tour", () => {
  it("starts on the Hof and leaves out hidden areas", () => {
    expect(TOUR[0]!.path).toBe("/");
    expect(tourSteps(() => true)).toHaveLength(TOUR.length);
    expect(tourSteps((id) => id !== "animals").map((s) => s.path)).toEqual(["/", "/pflanzen", "/mehr"]);
  });

  it("remembers the step and tells listeners", () => {
    let calls = 0;
    const off = subscribeTour(() => calls++);
    setTourStep(2);
    expect(readTourStep()).toBe(2);
    setTourStep(null);
    expect(readTourStep()).toBeNull();
    off();
    setTourStep(1);
    expect(calls).toBe(2);
    setTourStep(null);
  });
});
