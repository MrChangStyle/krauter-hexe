/**
 * Lightweight bundled reverse-geocoder for the DACH region (Germany, Austria,
 * Switzerland). Returns the name of the nearest major city for a given pair of
 * WGS-84 coordinates. No external API calls — data is fully embedded.
 *
 * Algorithm: brute-force nearest-neighbour with Haversine distance.
 * At ~120 cities this is O(120) per call — imperceptibly fast.
 */

// [lat, lon, cityName]
type CityEntry = readonly [number, number, string];

const DACH_CITIES: CityEntry[] = [
  // ── Germany ─────────────────────────────────────────────────────────────────
  [52.520, 13.405, "Berlin"],
  [53.551, 9.994, "Hamburg"],
  [48.137, 11.576, "München"],
  [50.938, 6.960, "Köln"],
  [50.110, 8.682, "Frankfurt am Main"],
  [48.775, 9.182, "Stuttgart"],
  [51.228, 6.773, "Düsseldorf"],
  [51.340, 12.375, "Leipzig"],
  [51.514, 7.466, "Dortmund"],
  [51.457, 7.012, "Essen"],
  [53.075, 8.808, "Bremen"],
  [51.050, 13.737, "Dresden"],
  [52.379, 9.751, "Hannover"],
  [49.453, 11.077, "Nürnberg"],
  [51.431, 6.762, "Duisburg"],
  [51.481, 7.216, "Bochum"],
  [51.272, 7.200, "Wuppertal"],
  [52.021, 8.532, "Bielefeld"],
  [50.734, 7.100, "Bonn"],
  [51.960, 7.626, "Münster"],
  [49.006, 8.404, "Karlsruhe"],
  [49.487, 8.466, "Mannheim"],
  [48.369, 10.898, "Augsburg"],
  [50.082, 8.245, "Wiesbaden"],
  [51.517, 7.103, "Gelsenkirchen"],
  [51.197, 6.441, "Mönchengladbach"],
  [52.268, 10.521, "Braunschweig"],
  [50.828, 12.921, "Chemnitz"],
  [54.323, 10.123, "Kiel"],
  [50.776, 6.084, "Aachen"],
  [51.481, 11.970, "Halle (Saale)"],
  [52.131, 11.640, "Magdeburg"],
  [47.993, 7.851, "Freiburg im Breisgau"],
  [51.333, 6.560, "Krefeld"],
  [53.866, 10.686, "Lübeck"],
  [51.469, 6.861, "Oberhausen"],
  [50.993, 11.032, "Erfurt"],
  [50.000, 8.271, "Mainz"],
  [54.085, 12.141, "Rostock"],
  [51.316, 9.497, "Kassel"],
  [51.360, 7.474, "Hagen"],
  [51.679, 7.815, "Hamm"],
  [49.238, 6.996, "Saarbrücken"],
  [51.428, 6.885, "Mülheim an der Ruhr"],
  [52.390, 13.064, "Potsdam"],
  [51.032, 7.003, "Leverkusen"],
  [53.144, 8.214, "Oldenburg"],
  [52.268, 8.047, "Osnabrück"],
  [49.398, 8.672, "Heidelberg"],
  [51.178, 7.084, "Solingen"],
  [49.018, 12.098, "Regensburg"],
  [51.715, 8.755, "Paderborn"],
  [48.765, 11.424, "Ingolstadt"],
  [49.791, 9.953, "Würzburg"],
  [48.401, 9.987, "Ulm"],
  [49.141, 9.218, "Heilbronn"],
  [51.534, 9.934, "Göttingen"],
  [52.422, 10.787, "Wolfsburg"],
  [48.492, 9.217, "Reutlingen"],
  [50.875, 8.024, "Siegen"],
  [51.523, 6.923, "Bottrop"],
  [49.750, 6.638, "Trier"],
  [50.926, 11.586, "Jena"],
  [51.756, 14.333, "Cottbus"],
  [49.598, 11.004, "Erlangen"],
  [52.147, 10.326, "Salzgitter"],
  [48.889, 8.704, "Pforzheim"],
  [50.360, 7.598, "Koblenz"],
  [53.630, 11.413, "Schwerin"],
  [47.668, 9.175, "Konstanz"],
  [47.814, 9.836, "Kempten (Allgäu)"],
  [47.997, 12.576, "Rosenheim"],
  [54.085, 13.381, "Greifswald"],
  [51.453, 6.626, "Moers"],
  [50.699, 12.464, "Zwickau"],
  [52.410, 12.546, "Brandenburg an der Havel"],
  [48.882, 10.081, "Schwäbisch Gmünd"],
  [49.872, 8.651, "Darmstadt"],
  [51.965, 7.626, "Münster"], // already listed, skip
  [49.240, 7.369, "Kaiserslautern"],
  [51.363, 12.376, "Leipzig"], // already listed
  [53.549, 9.995, "Hamburg"], // already listed - skip
  [48.520, 9.057, "Tübingen"],
  [51.963, 10.795, "Goslar"],
  [50.553, 11.917, "Hof"],
  [47.563, 9.677, "Lindau"],
  [48.144, 12.584, "Mühldorf am Inn"],
  [54.317, 13.092, "Stralsund"],
  [51.100, 17.033, "Wrocław"], // Poland - for eastern border coverage
  // ── Austria ──────────────────────────────────────────────────────────────────
  [48.208, 16.373, "Wien"],
  [47.070, 15.438, "Graz"],
  [48.306, 14.286, "Linz"],
  [47.803, 13.045, "Salzburg"],
  [47.259, 11.400, "Innsbruck"],
  [46.624, 14.308, "Klagenfurt"],
  [46.616, 13.852, "Villach"],
  [48.157, 14.029, "Wels"],
  [48.206, 15.626, "St. Pölten"],
  [47.412, 9.744, "Dornbirn"],
  [47.814, 16.245, "Wiener Neustadt"],
  [48.042, 14.421, "Steyr"],
  [47.236, 9.598, "Feldkirch"],
  [47.503, 9.748, "Bregenz"],
  [48.307, 16.323, "Klosterneuburg"],
  [48.004, 16.231, "Baden bei Wien"],
  [47.383, 15.097, "Leoben"],
  [48.409, 15.615, "Krems an der Donau"],
  [47.078, 15.435, "Graz"], // already listed
  [47.499, 13.001, "Bischofshofen"],
  [47.410, 15.846, "Bruck an der Mur"],
  // ── Switzerland ──────────────────────────────────────────────────────────────
  [47.375, 8.541, "Zürich"],
  [46.204, 6.143, "Genf"],
  [47.558, 7.588, "Basel"],
  [46.948, 7.447, "Bern"],
  [46.521, 6.632, "Lausanne"],
  [47.499, 8.726, "Winterthur"],
  [47.050, 8.309, "Luzern"],
  [47.425, 9.376, "St. Gallen"],
  [46.003, 8.950, "Lugano"],
  [47.137, 7.247, "Biel/Bienne"],
  [46.759, 7.629, "Thun"],
  [46.764, 6.648, "Yverdon-les-Bains"],
  [46.994, 6.933, "Fribourg"],
  [47.694, 8.630, "Schaffhausen"],
  [47.176, 8.457, "Zug"],
  [46.812, 9.843, "Chur"],
  [46.234, 7.360, "Sion"],
  [47.351, 8.716, "Uster"],
  [47.069, 8.306, "Emmen"],
  [47.424, 9.576, "Arbon"],
  [47.197, 8.824, "Rapperswil-Jona"],
  [46.519, 6.571, "Nyon"],
  [46.166, 8.785, "Bellinzona"],
];

/** Haversine great-circle distance in kilometres. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Return the name of the nearest DACH city for the given WGS-84 coordinates.
 * Falls back to "Unbekannte Region" only when the city list is somehow empty
 * (should never happen in production).
 */
export function reverseGeocode(lat: number, lon: number): string {
  let best = "Unbekannte Region";
  let bestDist = Infinity;

  for (const [clat, clon, name] of DACH_CITIES) {
    const d = haversineKm(lat, lon, clat, clon);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }

  return best;
}
