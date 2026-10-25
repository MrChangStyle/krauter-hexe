import { useRef } from "react";

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Compass heading while the camera is open (bed photo, Bienen-Standort-Check): iOS reports webkitCompassHeading,
 * others an absolute alpha (counter-clockwise from north).
 */
export function useCompass() {
  const heading = useRef<number | null>(null);
  async function start() {
    try {
      const api = (globalThis as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent;
      if (api?.requestPermission) await api.requestPermission();
    } catch {
      /* no compass then */
    }
    const handler = (e: Event) => {
      const ev = e as OrientationEvent;
      if (typeof ev.webkitCompassHeading === "number") heading.current = ev.webkitCompassHeading;
      else if (ev.absolute && typeof ev.alpha === "number") heading.current = (360 - ev.alpha) % 360;
    };
    window.addEventListener("deviceorientationabsolute", handler);
    window.addEventListener("deviceorientation", handler);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
    };
  }
  return { heading, start };
}
