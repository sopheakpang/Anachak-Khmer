import { PORTS, type BridgeMessage } from '@temples/shared';

/** WebSocket to the bridge with automatic reconnect (prompt 07). */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private retry = 500;
  private stopped = false;

  constructor(
    private readonly onMessage: (m: BridgeMessage) => void,
    private readonly onConnection: (up: boolean) => void,
    private readonly url = new URLSearchParams(location.search).get('bridge') ??
      `ws://localhost:${PORTS.bridgeWs}`,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  private open(): void {
    const ws = new WebSocket(`${this.url}/?role=game`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      this.onConnection(true);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as BridgeMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.onConnection(false);
      if (this.stopped) return;
      setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 5000);
    };
  }
}
