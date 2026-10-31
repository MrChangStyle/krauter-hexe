import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FindSpotOverviewCell } from "@workspace/api-client-react";

/**
 * Lexikon → Karte (docs/fundorte.md): all scans with a find on one map,
 * loaded lazily. One square per cell with the number of finds; tapping a
 * square hands it to `onSelect`, which lists the species found there.
 */
export default function FindSpotsOverviewMap({
  cells,
  onSelect,
}: {
  cells: FindSpotOverviewCell[];
  onSelect: (cell: FindSpotOverviewCell) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const m = L.map(box.current!, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 13,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    const squares = cells.map((c) => {
      const halfLat = c.km / 2 / 111.32;
      const halfLon = halfLat / Math.max(Math.cos((c.lat * Math.PI) / 180), 0.05);
      const square = L.rectangle(
        [
          [c.lat - halfLat, c.lon - halfLon],
          [c.lat + halfLat, c.lon + halfLon],
        ],
        c.approx
          ? // Older scans only know their town: a dashed, paler square.
            { color: "#b45309", weight: 1.5, dashArray: "4 4", fillColor: "#f59e0b", fillOpacity: 0.2 }
          : { color: "#15803d", weight: 1, fillColor: "#16a34a", fillOpacity: Math.min(0.25 + c.finds * 0.1, 0.7) },
      );
      square.bindTooltip(String(c.finds), { permanent: true, direction: "center", className: "find-spot-label" });
      square.on("click", () => select.current(c));
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
  }, [cells]);

  return <div ref={box} className="h-80 w-full overflow-hidden rounded-xl border" data-testid="find-spots-overview-map" />;
}
