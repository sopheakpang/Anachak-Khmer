import { describe, expect, it } from 'vitest';
import { GAME_NAME, PORTS, RENDER_SIZE } from './index';

describe('shared constants', () => {
  it('keeps the 9:16 render size', () => {
    expect(RENDER_SIZE.width / RENDER_SIZE.height).toBeCloseTo(9 / 16);
  });
  it('uses the ports from the spec', () => {
    expect(PORTS).toEqual({ game: 5173, bridgeWs: 7420, host: 7421 });
  });
  it('has the Khmer name', () => {
    expect(GAME_NAME.km).toBe('សាងប្រាសាទ');
  });
});
