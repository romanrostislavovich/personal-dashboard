// Device tools: what a device of the user (the browser extension, the desktop app, later the
// phone) can do or tell while it is online — the page open in the browser, the window in
// front — offered to the assistant and to the outside AI clients (MCP) next to the tools of
// the sections. A device holds a WebSocket to the server (`/api/devices/socket`); the server
// sends it the calls and waits for the answers.

/** The kinds of devices; a tool's name starts with its kind (`browser_current_page`). */
export const DEVICE_KINDS = ['browser', 'computer', 'phone'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** A tool a device offers. */
export interface DeviceToolSpec {
  /** `<kind>_<what>`: Latin letters, digits and `_`. */
  name: string;
  /** For the model: what it returns and when it is useful. */
  description: string;
  /** JSON Schema of the arguments. */
  inputSchema: Record<string, unknown>;
  /** Changes something (opens a tab). */
  writes?: boolean;
}

/** Device → server. */
export type DeviceMessage =
  /** The first message: who it is (the session's access token) and what it offers. */
  | {
      type: 'hello';
      accessToken: string;
      kind: DeviceKind;
      /** "Chrome on the work laptop". */
      name: string;
      tools: DeviceToolSpec[];
    }
  /** What it offers changed (a tool switched off in its settings). */
  | {type: 'tools'; tools: DeviceToolSpec[]}
  /** The user is at this device now: its tools answer before another device's of the kind. */
  | {type: 'active'}
  | {type: 'result'; id: string; value: unknown}
  | {type: 'error'; id: string; message: string}
  /** Keeps the connection (and a browser's service worker) alive. */
  | {type: 'ping'};

/** Server → device. */
export type ServerToDevice =
  | {type: 'welcome'}
  | {type: 'call'; id: string; name: string; args: Record<string, unknown>}
  | {type: 'pong'}
  /** The access token expired: send a fresh one in a new hello. */
  | {type: 'unauthorized'};

/** A tool name a device may use. */
export const DEVICE_TOOL_NAME = /^(browser|computer|phone)_[a-z0-9_]{1,60}$/;
