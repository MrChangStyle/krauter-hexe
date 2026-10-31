import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FindSpotCell } from "@workspace/api-client-react";

/**
 * Fundorte (docs/fundorte.md) on OpenStreetMap, loaded lazily: one square per
 * cell (2 km, 25 km for protected species) with the number of finds. Only
 * cells, never points – nothing more exact than the cell exists.
 */
export default function FindSpotsMap({ cells, cellKm }: { cells: FindSpotCell[]; cellKm: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = L.map(box.current!, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 13,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    const halfLat = cellKm / 2 / 111.32;
    const squares = cells.map((c) => {
      const halfLon = halfLat / Math.max(Math.cos((c.lat * Math.PI) / 180), 0.05);
      const square = L.rectangle(
        [
          [c.lat - halfLat, c.lon - halfLon],
          [c.lat + halfLat, c.lon + halfLon],
        ],
        { color: "#15803d", weight: 1, fillColor: "#16a34a", fillOpacity: Math.min(0.25 + c.finds * 0.1, 0.7) },
      );
      square.bindTooltip(String(c.finds), { permanent: true, direction: "center", className: "find-spot-label" });
      const [year, month] = c.lastMonth.split("-");
      square.bindPopup(`${c.finds} ${c.finds === 1 ? "Fund" : "Funde"} · zuletzt ${month}/${year}`);
      return square.addTo(m);
    });
    if (squares.length > 0) m.fitBounds(L.featureGroup(squares).getBounds(), { padding: [24, 24], maxZoom: 11 });
    else m.setView([51.1, 10.4], 5);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current!);
    return () => {
      resize.disconnect();
      m.remove();
    };
  }, [cells, cellKm]);

  return <div ref={box} className="h-64 w-full overflow-hidden rounded-xl border" data-testid="find-spots-map" />;
}
