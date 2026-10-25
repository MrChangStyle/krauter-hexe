import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed } from "lucide-react";
import type { MapCenter, Pasture, PastureBoundary } from "@workspace/api-client-react";
import { MUTED_COLOR, STATUS_COLORS, initialView } from "@/lib/pasture-map";

/**
 * Weidekarte (docs/weide.md) on OpenStreetMap, loaded lazily from weide.tsx.
 * "view" shows the drawn pastures coloured by status; a tap on one calls
 * onSelect. "draw" adds a corner per tap to `value`, with the farm's other
 * pastures in grey for orientation.
 */
type Props = { center: MapCenter | null; className?: string } & (
  | { mode: "view"; pastures: Pasture[]; onSelect: (id: number) => void }
  | { mode: "draw"; others: Pasture[]; value: PastureBoundary; onChange: (next: PastureBoundary) => void }
);

const latLngs = (b: PastureBoundary) => b.map(([lat, lng]) => L.latLng(lat!, lng!));

export default function PastureMap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapes = useRef<L.LayerGroup | null>(null);
  // The latest props for Leaflet's handlers, which are bound once.
  const latest = useRef(props);
  latest.current = props;
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const m = L.map(box.current!);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    const p = latest.current;
    const outlines = p.mode === "draw" && p.value.length > 0 ? [p.value] : (p.mode === "view" ? p.pastures : p.others).flatMap((x) => (x.boundary ? [x.boundary] : []));
    const view = initialView(outlines, p.center);
    if ("bounds" in view) m.fitBounds(view.bounds, { padding: [24, 24], maxZoom: 18 });
    else m.setView(view.center, view.zoom);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const cur = latest.current;
      if (cur.mode === "draw" && cur.value.length < 100) cur.onChange([...cur.value, [e.latlng.lat, e.latlng.lng]]);
    });
    shapes.current = L.layerGroup().addTo(m);
    map.current = m;
    // In a dialog the box gets its size after opening.
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current!);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      shapes.current = null;
    };
  }, []);

  const drawn = props.mode === "draw" ? props.value : null;
  const list = props.mode === "view" ? props.pastures : props.others;
  useEffect(() => {
    const group = shapes.current;
    if (!group) return;
    group.clearLayers();
    for (const p of list) {
      if (!p.boundary) continue;
      const color = props.mode === "draw" || p.archived ? MUTED_COLOR : STATUS_COLORS[p.status];
      const shape = L.polygon(latLngs(p.boundary), { color, weight: 2, fillOpacity: props.mode === "draw" ? 0.1 : 0.3, interactive: props.mode === "view" });
      shape.bindTooltip(p.name, { permanent: true, direction: "center", className: "pasture-map-label" });
      if (props.mode === "view") shape.on("click", () => (latest.current as Extract<Props, { mode: "view" }>).onSelect(p.id));
      shape.addTo(group);
    }
    if (drawn && drawn.length > 0) {
      const points = latLngs(drawn);
      const style = { color: "#2563eb", weight: 3, interactive: false };
      (drawn.length >= 3 ? L.polygon(points, { ...style, fillOpacity: 0.2 }) : L.polyline(points, style)).addTo(group);
      points.forEach((pt, i) =>
        L.circleMarker(pt, { radius: i === points.length - 1 ? 7 : 5, color: "#2563eb", fillColor: "#fff", fillOpacity: 1, weight: 2, interactive: false }).addTo(group),
      );
    }
  }, [list, drawn, props.mode]);

  function locate() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-border ${props.className ?? "h-64"}`}>
      <div ref={box} className="h-full w-full" data-testid="pasture-map" />
      {props.mode === "draw" && "geolocation" in navigator && (
        <button
          type="button"
          onClick={locate}
          aria-label="Zu meinem Standort"
          className="absolute right-2 top-2 z-[1000] rounded-md border border-border bg-background p-2 shadow"
        >
          <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse text-primary" : ""}`} />
        </button>
      )}
    </div>
  );
}
