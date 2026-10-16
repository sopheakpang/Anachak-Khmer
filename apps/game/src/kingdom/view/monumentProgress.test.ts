import { describe, expect, it } from 'vitest';
import { monumentProgressHtml } from './hud';

/** PK 1.9.0 (Sprint 1): the temple's progress bar with its picture filling from the foot up. */
describe('the temple progress on the objective line', () => {
  it('shows the picture clipped to the built height, a bar and the percent in Khmer digits', () => {
    const html = monumentProgressHtml('ព្រះគោ', 0.37, 'data:icon');
    expect(html).toContain('data-pct="37"');
    expect(html).toContain('clip-path:inset(63% 0 0 0)');
    expect(html).toContain('width:37%');
    expect(html).toContain('៣៧%');
    expect(html).toContain('ព្រះគោ');
  });

  it('no picture until the icon is drawn; no temple yet = a dash', () => {
    const html = monumentProgressHtml('ព្រះគោ', null, null);
    expect(html).not.toContain('k-mon-pic');
    expect(html).toContain('—');
    expect(html).toContain('width:0%');
  });

  it('a finished temple is whole', () => {
    expect(monumentProgressHtml('ព្រះគោ', 1, 'x')).toContain('clip-path:inset(0% 0 0 0)');
    expect(monumentProgressHtml('x', 1.4, null)).toContain('data-pct="100"');
  });
});
