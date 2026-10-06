import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';

const PUBLIC = resolve(__dirname, '../public-mobile');

describe("PK's 3D model files ship with the game (1.6.0)", () => {
  it('every prop slot and hero model file is there, and small', () => {
    const data = loadKingdom();
    const files = [
      ...Object.values(data.props.slots).map((s) => s!.file),
      ...Object.entries(data.anachak.hero.models ?? {})
        .filter(([k]) => !k.startsWith('$'))
        .map(([, m]) => (typeof m === 'string' ? m : m.file)),
    ];
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const p = resolve(PUBLIC, f);
      expect(existsSync(p), f).toBe(true);
      // Props stay small for the phone build; a hero model may be up to 3 MB.
      expect(statSync(p).size, f).toBeLessThan(f.startsWith('models/props/') ? 400 * 1024 : 3 * 1024 * 1024);
    }
  });
});
