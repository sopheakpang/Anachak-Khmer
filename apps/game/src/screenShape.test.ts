import { describe, expect, it } from 'vitest';
import { landscapeSizeFor } from './screenShape';

describe('stage fits the device shape (D72 phones, D74 iPads)', () => {
  it('long phones get a wider stage, 1080 high', () => {
    expect(landscapeSizeFor(915, 412)).toEqual({ width: 2399, height: 1080 });
    expect(landscapeSizeFor(412, 915)).toEqual({ width: 2399, height: 1080 }); // held upright
    expect(landscapeSizeFor(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(landscapeSizeFor(3000, 1000).width).toBe(2560);
  });

  it('iPads get a taller stage, 1920 wide, no black bars', () => {
    expect(landscapeSizeFor(1024, 768)).toEqual({ width: 1920, height: 1440 }); // iPad 9.7" 4:3
    expect(landscapeSizeFor(1194, 834)).toEqual({ width: 1920, height: 1341 }); // iPad Pro 11"
    expect(landscapeSizeFor(1366, 1024)).toEqual({ width: 1920, height: 1439 }); // iPad Pro 12.9"
    expect(landscapeSizeFor(1000, 1000)).toEqual({ width: 1920, height: 1440 }); // never taller than 4:3
  });
});
