import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileFor, lanUrls, mimeFor } from '../tools/localServe';

describe('play on iPad over Wi-Fi (D74)', () => {
  const root = resolve('/games/dist-mobile');

  it('serves files inside the build folder only', () => {
    expect(fileFor(root, '/')).toBe(`${root}${sep}index.html`);
    expect(fileFor(root, '/assets/mobile-x.js?v=1')).toBe(resolve(root, 'assets/mobile-x.js'));
    expect(fileFor(root, '/%E1%9E%80.png')).toBe(resolve(root, 'ក.png'));
    expect(fileFor(root, '/../secret.txt')).toBe(resolve(root, 'secret.txt'));
    expect(fileFor(root, '/%2e%2e/%2e%2e/etc/passwd')!.startsWith(root + sep)).toBe(true);
    expect(fileFor(root, '/%E0%A4%A')).toBeNull();
  });

  it('sends the types Safari needs for modules, fonts and the manifest', () => {
    expect(mimeFor('a/b.js')).toContain('javascript');
    expect(mimeFor('x.webmanifest')).toBe('application/manifest+json');
    expect(mimeFor('f.WOFF2')).toBe('font/woff2');
    expect(mimeFor('noext')).toBe('application/octet-stream');
  });

  it('lists the home-network address first', () => {
    const urls = lanUrls(
      {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        vpn: [{ address: '100.64.1.2', family: 'IPv4', internal: false }],
        wifi: [
          { address: '192.168.1.23', family: 'IPv4', internal: false },
          { address: 'fe80::1', family: 'IPv6', internal: false },
        ],
      },
      8080,
    );
    expect(urls).toEqual(['http://192.168.1.23:8080/', 'http://100.64.1.2:8080/']);
  });
});
