/**
 * Where viewer events come from. The pipeline doesn't care which source is used:
 * simulator (host panel) now; TikTok and TikFinity adapters arrive in prompt 18.
 */
export interface EventSource {
  readonly name: 'simulator' | 'tiktok' | 'tikfinity';
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(cb: (raw: unknown) => void): void;
  onStatus(cb: (s: 'connected' | 'reconnecting' | 'offline') => void): void;
}

/** Events typed or generated in the host panel. Always "connected". */
export class SimulatorSource implements EventSource {
  readonly name = 'simulator' as const;
  private listeners: Array<(raw: unknown) => void> = [];
  private statusListeners: Array<(s: 'connected' | 'reconnecting' | 'offline') => void> = [];

  async start(): Promise<void> {
    for (const l of this.statusListeners) l('connected');
  }
  async stop(): Promise<void> {
    for (const l of this.statusListeners) l('offline');
  }
  onEvent(cb: (raw: unknown) => void): void {
    this.listeners.push(cb);
  }
  onStatus(cb: (s: 'connected' | 'reconnecting' | 'offline') => void): void {
    this.statusListeners.push(cb);
  }
  push(raw: unknown): void {
    for (const l of this.listeners) l(raw);
  }
}
