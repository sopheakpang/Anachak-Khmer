import fonts from '../../../config/fonts.json';
import { fontStack, fontWeight, missingInMainFont, type FontsConfig } from '@temples/shared';

const config = fonts as FontsConfig;

/** Test lines from prompt 02. The long word has stacked subscripts and vowels (AC-20). */
export const TEST_LINES = ['សាងប្រាសាទ', 'ស្ថាបត្យករហ្លួង', 'ព្រះគោ', 'The Temples 879'] as const;

/** One row per font: Moulpali (title) and Kantumruy Pro (names, bold). */
export const TEST_ROLES = ['title', 'names'] as const;

/** HTML test panel: every test line in every font role. */
export function createKhmerPanel(parent: HTMLElement, onTone: () => void): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'khmer-panel';
  panel.dataset.testid = 'khmer-panel';

  const head = document.createElement('div');
  head.className = 'panel-head';
  head.textContent = 'Font test · តេស្តអក្សរ';
  const tone = document.createElement('button');
  tone.type = 'button';
  tone.textContent = 'Test tone 440 Hz';
  tone.addEventListener('click', onTone);
  head.append(tone);
  panel.append(head);

  for (const role of TEST_ROLES) {
    const row = document.createElement('section');
    row.className = 'font-row';
    const name = config.roles[role] ?? role;
    const label = document.createElement('div');
    label.className = 'font-label';
    const missing = missingInMainFont(config, role);
    label.textContent = `${name} · ${role}` + (missing.length ? ` · ${missing.join('+')} from fallback` : '');
    const sample = document.createElement('div');
    sample.className = 'font-sample';
    sample.style.fontFamily = fontStack(config, role);
    sample.style.fontWeight = String(fontWeight(config, role));
    sample.textContent = TEST_LINES.join('  ·  ');
    row.append(label, sample);
    panel.append(row);
  }
  parent.append(panel);
  return panel;
}

/** Wait until every bundled family has loaded its Khmer and English faces. */
export async function loadFonts(): Promise<boolean> {
  const sample = TEST_LINES.join(' ');
  const families = Object.keys(config.families);
  const results = await Promise.all(families.map((f) => document.fonts.load(`32px "${f}"`, sample)));
  await document.fonts.ready;
  return results.every((faces) => faces.length > 0);
}

/** CSS font shorthand for a role at a size, e.g. `700 64px "Kantumruy Pro", sans-serif`. */
export function fontFor(role: 'title' | 'bigMoment' | 'names' | 'small', sizePx: number): string {
  return `${fontWeight(config, role)} ${sizePx}px ${fontStack(config, role)}`;
}
