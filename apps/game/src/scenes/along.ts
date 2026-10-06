export type XZ = [number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Points along a polyline at distance fraction f (0..1). */
export function along(points: XZ[], f: number): XZ {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0]!;
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    segs.push(d);
    total += d;
  }
  let want = (((f % 1) + 1) % 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i]!) {
      const k = want / segs[i]!;
      return [lerp(points[i]![0], points[i + 1]![0], k), lerp(points[i]![1], points[i + 1]![1], k)];
    }
    want -= segs[i]!;
  }
  return points.at(-1)!;
}
