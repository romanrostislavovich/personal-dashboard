import {
  DeviceKind,
  DeviceMessage,
  DeviceToolSpec,
  ServerToDevice,
} from '@pd/contracts';

/** A tool of this device: what the server is told, and what runs when it is called. */
export interface DeviceTool extends DeviceToolSpec {
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface DeviceLinkOptions {
  /** The dashboard's address: `https://dash.example.com`. */
  server: string;
  kind: DeviceKind;
  /** "Chrome on the work laptop". */
  name: string;
  /** The access token of the session now, fresh (refreshed when it is not). */
  accessToken: () => Promise<string | null>;
  /** The tools as they are now (some may be switched off in the device's settings). */
  tools: () => DeviceTool[];
  /** The WebSocket of the platform (a test passes its own). */
  WebSocket?: typeof WebSocket;
}

/** Sent this often: keeps the connection, and a browser's service worker, alive. */
const PING_MS = 20_000;
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

/**
 * This device's link to the server: its tools offered to the assistant and to the outside AI
 * clients while it is online (see device-tools in contracts). Holds a WebSocket to
 * `/api/devices/socket`, says who it is with the session's access token, runs the calls that
 * come and answers them; comes back after a break, waiting longer each time.
 */
export class DeviceLink {
  private socket: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private wait = RETRY_FIRST_MS;
  private stopped = true;
  private reauthorized = false;

  constructor(private readonly options: DeviceLinkOptions) {}

  get connected(): boolean {
    return this.socket?.readyState === 1;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retry) {
      clearTimeout(this.retry);
    }
    this.socket?.close();
    this.socket = null;
  }

  /** The tools changed (switched on or off in the settings). */
  toolsChanged(): void {
    this.send({type: 'tools', tools: this.specs()});
  }

  /** The user is at this device now. */
  active(): void {
    this.send({type: 'active'});
  }

  private connect(): void {
    const Socket = this.options.WebSocket ?? WebSocket;
    const url = `${this.options.server.replace(/\/+$/, '').replace(/^http/, 'ws')}/api/devices/socket`;
    let socket: WebSocket;
    try {
      socket = new Socket(url);
    } catch {
      this.again();
      return;
    }
    this.socket = socket;
    socket.onopen = () => void this.hello();
    socket.onmessage = event => void this.onMessage(String(event.data));
    socket.onclose = () => {
      if (this.ping) {
        clearInterval(this.ping);
        this.ping = null;
      }
      if (this.socket === socket) {
        this.socket = null;
        this.again();
      }
    };
    socket.onerror = () => socket.close();
  }

  private async hello(): Promise<void> {
    const accessToken = await this.options.accessToken().catch(() => null);
    if (!accessToken) {
      // Signed out: nothing to offer; looked at again later.
      this.socket?.close();
      return;
    }
    this.send({
      type: 'hello',
      accessToken,
      kind: this.options.kind,
      name: this.options.name,
      tools: this.specs(),
    });
  }

  private async onMessage(raw: string): Promise<void> {
    let message: ServerToDevice;
    try {
      message = JSON.parse(raw) as ServerToDevice;
    } catch {
      return;
    }
    switch (message.type) {
      case 'welcome':
        this.wait = RETRY_FIRST_MS;
        this.reauthorized = false;
        this.ping ??= setInterval(() => this.send({type: 'ping'}), PING_MS);
        break;
      case 'unauthorized':
        // An access token lives 15 minutes: one more try with a fresh one, then a break.
        if (this.reauthorized) {
          this.socket?.close();
        } else {
          this.reauthorized = true;
          await this.hello();
        }
        break;
      case 'call':
        await this.run(message.id, message.name, message.args ?? {});
        break;
    }
  }

  private async run(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const tool = this.options.tools().find(one => one.name === name);
    if (!tool) {
      this.send({
        type: 'error',
        id,
        message: `${name} is switched off on this device`,
      });
      return;
    }
    try {
      this.send({type: 'result', id, value: (await tool.run(args)) ?? null});
    } catch (error) {
      this.send({
        type: 'error',
        id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private specs(): DeviceToolSpec[] {
    return this.options
      .tools()
      .map(({name, description, inputSchema, writes}) => ({
        name,
        description,
        inputSchema,
        writes,
      }));
  }

  private send(message: DeviceMessage): void {
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private again(): void {
    if (this.stopped || this.retry) {
      return;
    }
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, this.wait);
    this.wait = Math.min(RETRY_MAX_MS, this.wait * 2);
  }
}
