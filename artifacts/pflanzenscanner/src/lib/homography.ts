/**
 * Perspective for the Foto mit Pflanzraster: a homography from the bed's
 * unit square (u along the length, v along the width, 0–1) to the four
 * corners the user tapped on the photo (0–1 of width and height).
 * Corner order = grid order: (0,0), (1,0), (1,1), (0,1).
 */

export type Point = { x: number; y: number };
export type Matrix = [number, number, number, number, number, number, number, number, number];

/** Gaussian elimination for the 8×8 system; null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c += 1) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Matrix mapping the unit square onto the quadrilateral; null when degenerate. */
export function squareToQuad(corners: Point[]): Matrix | null {
  if (corners.length !== 4) return null;
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const a: number[][] = [];
  const b: number[] = [];
  src.forEach((s, i) => {
    const d = corners[i]!;
    a.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    a.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  });
  const h = solve(a, b);
  return h ? ([...h, 1] as Matrix) : null;
}

export function apply(h: Matrix, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invert(h: Matrix): Matrix | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = -(d * j - f * g);
  const C = d * i - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv: Matrix = [
    A, -(b * j - c * i), b * f - c * e,
    B, a * j - c * g, -(a * f - c * d),
    C, -(a * i - b * g), a * e - b * d,
  ];
  return inv.map((v) => v / det) as Matrix;
}

/** The grid cell under a point of the photo, or null outside the bed. */
export function cellAt(inverse: Matrix, p: Point, cols: number, rows: number): { x: number; y: number } | null {
  const uv = apply(inverse, p);
  if (!(uv.x >= 0 && uv.x < 1 && uv.y >= 0 && uv.y < 1)) return null;
  return { x: Math.min(cols - 1, Math.floor(uv.x * cols)), y: Math.min(rows - 1, Math.floor(uv.y * rows)) };
}

/** Where the camera looked, from the compass heading. */
export function headingText(deg: number): string {
  const dirs = ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"];
  return dirs[Math.round(deg / 45) % 8]!;
}
