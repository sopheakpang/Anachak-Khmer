/** The game shows Khmer and English only (no Thai). */
export type Script = 'khmer' | 'latin';

export interface FontsConfig {
  families: Record<string, { file: string; weights: number[]; covers: Script[]; author: string }>;
  roles: Record<string, string>;
  weights?: Record<string, number>;
  fallbacks: string[];
}

/** CSS font weight for a role (default 400). */
export function fontWeight(config: FontsConfig, role: string): number {
  return config.weights?.[role] ?? 400;
}

/** CSS font-family stack for a role: the role's font, then fallbacks, then system. */
export function fontStack(config: FontsConfig, role: string): string {
  const main = config.roles[role];
  if (!main) throw new Error(`Unknown font role: ${role}`);
  const names = [main, ...config.fallbacks.filter((f) => f !== main)];
  return [...names.map((n) => `"${n}"`), 'sans-serif'].join(', ');
}

/** Scripts a stack can draw with its bundled fonts (no system fallback). */
export function stackCoverage(config: FontsConfig, role: string): Set<Script> {
  const main = config.roles[role];
  const names = [main, ...config.fallbacks];
  const out = new Set<Script>();
  for (const n of names) for (const s of config.families[n ?? '']?.covers ?? []) out.add(s);
  return out;
}

/** Scripts the role's own font lacks, which a fallback must draw. */
export function missingInMainFont(config: FontsConfig, role: string): Script[] {
  const covers = config.families[config.roles[role] ?? '']?.covers ?? [];
  return (['khmer', 'latin'] as Script[]).filter((s) => !covers.includes(s));
}
