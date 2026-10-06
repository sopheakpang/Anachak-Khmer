import { appendFile, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dayKey } from './store';
import type { Logger } from './pipeline';

/** JSON-lines log in data/logs/bridge-YYYY-MM-DD.log, also echoed to the console. */
export function fileLogger(dir: string): Logger {
  mkdirSync(dir, { recursive: true });
  const write = (level: string, msg: string, data?: Record<string, unknown>) => {
    const now = Date.now();
    const line = JSON.stringify({ t: new Date(now).toISOString(), level, msg, ...data });
    appendFile(join(dir, `bridge-${dayKey(now)}.log`), line + '\n', () => {});
    (level === 'warn' ? console.warn : console.log)(`[bridge] ${msg}`, data ?? '');
  };
  return { info: (m, d) => write('info', m, d), warn: (m, d) => write('warn', m, d) };
}
