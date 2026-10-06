import { describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';

// The meter only needs a div and a keydown listener; node has neither.
vi.stubGlobal('document', { createElement: () => ({ className: '', hidden: true, textContent: '' }) });
vi.stubGlobal('window', { addEventListener: () => {} });
const { Meter } = await import('./meter');

const renderer = (calls: number, triangles: number) =>
  ({ info: { render: { calls, triangles } } }) as unknown as WebGLRenderer;
const parent = { append: () => {} } as unknown as HTMLElement;

describe('frame meter (D79: post-processing is counted apart from the scene)', () => {
  it('without post, the whole frame is the scene', () => {
    const m = new Meter(parent, false);
    vi.spyOn(performance, 'now').mockReturnValue(2000);
    m.frame(renderer(50, 400_000), 10);
    expect(m.stats).toMatchObject({ drawCalls: 50, triangles: 400_000, postCalls: 0, postTriangles: 0 });
  });

  it('with post, the scene share is held to the budget and the rest is shown as post', () => {
    const m = new Meter(parent, false);
    vi.spyOn(performance, 'now').mockReturnValue(4000);
    m.frame(renderer(220, 1_200_000), 10, { sceneCalls: 100, sceneTriangles: 580_000 });
    expect(m.stats).toMatchObject({
      drawCalls: 100,
      triangles: 580_000,
      postCalls: 120,
      postTriangles: 620_000,
    });
  });
});
