import { describe, expect, it } from 'vitest';
import {
  cacheVersion,
  isIos,
  isPortrait,
  offlineFiles,
  serviceWorkerSource,
  shouldRegisterOffline,
} from './offline';

describe('iPhone web app (D73)', () => {
  it('caches every built file but the worker itself and source maps', () => {
    expect(
      offlineFiles([
        'index.html',
        'assets/a.js',
        'assets\\b.woff2',
        'sw.js',
        'assets/a.js.map',
        'assets/a.js',
      ]),
    ).toEqual(['./', './assets/a.js', './assets/b.woff2', './index.html']);
  });

  it('a new build gets a new cache name; the same build the same name', () => {
    const a = cacheVersion([
      ['index.html', 100],
      ['assets/a.js', 5000],
    ]);
    expect(
      cacheVersion([
        ['assets/a.js', 5000],
        ['index.html', 100],
      ]),
    ).toBe(a);
    expect(
      cacheVersion([
        ['index.html', 100],
        ['assets/a.js', 5001],
      ]),
    ).not.toBe(a);
  });

  it('the worker lists the files and its versioned cache', () => {
    const src = serviceWorkerSource(['./', './index.html'], 'v1');
    expect(src).toContain("'khmer-kingdoms-v1'");
    expect(src).toContain('["./","./index.html"]');
    expect(() => new Function(src)).not.toThrow();
  });

  it('registers only as a web app over https or localhost, never inside the Android app', () => {
    const web = { isSecureContext: true, location: { protocol: 'https:' }, navigator: { serviceWorker: {} } };
    expect(shouldRegisterOffline(web)).toBe(true);
    expect(shouldRegisterOffline({ ...web, Capacitor: {} })).toBe(false);
    expect(shouldRegisterOffline({ ...web, isSecureContext: false })).toBe(false);
    expect(shouldRegisterOffline({ ...web, navigator: {} })).toBe(false);
    expect(shouldRegisterOffline({ ...web, location: { protocol: 'file:' } })).toBe(false);
  });

  it('knows an upright phone and an iPhone or iPad', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5, 'iPhone')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, 'MacIntel')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, 'MacIntel')).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 15; SM-S928B)', 5, 'Linux armv8l')).toBe(false);
  });
});
