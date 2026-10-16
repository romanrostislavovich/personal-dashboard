import { Injectable } from '@nestjs/common';
import { DEVICE_TOOL_NAME, DeviceKind, DeviceToolSpec, ServerToDevice } from '@pd/contracts';
import { randomUUID } from 'node:crypto';
import { AiTool } from '../ai/ai-tool';

/** A device that does not answer in this long is taken as gone for this call. */
const CALL_TIMEOUT_MS = 20_000;

/** A device online, as the socket knows it. */
export interface OnlineDevice {
  id: string;
  userId: string;
  kind: DeviceKind;
  name: string;
  tools: DeviceToolSpec[];
  /** When the user was last at it: of two browsers, the one in use answers. */
  activeAt: number;
  send(message: ServerToDevice): void;
}

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * The tools of the user's devices online (see device-tools in contracts): kept while a device
 * holds its socket, offered to the assistant and to MCP clients as tools of their own module
 * (`browser`, `computer`, `phone`), and called through the socket.
 */
@Injectable()
export class DeviceToolsService {
  private readonly devices = new Map<string, OnlineDevice>();
  private readonly waiting = new Map<string, Waiting>();

  connected(device: OnlineDevice): void {
    this.devices.set(device.id, { ...device, tools: valid(device.tools, device.kind) });
  }

  disconnected(deviceId: string): void {
    this.devices.delete(deviceId);
  }

  updateTools(deviceId: string, tools: DeviceToolSpec[]): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.tools = valid(tools, device.kind);
    }
  }

  markActive(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.activeAt = Date.now();
    }
  }

  answered(callId: string, value: unknown): void {
    this.settle(callId, (call) => call.resolve(value));
  }

  failed(callId: string, message: string): void {
    this.settle(callId, (call) => call.reject(new Error(message)));
  }

  /** The devices of a user online now, the one in use first. */
  online(userId: string): OnlineDevice[] {
    return [...this.devices.values()]
      .filter((device) => device.userId === userId)
      .sort((a, b) => b.activeAt - a.activeAt);
  }

  /**
   * The tools of the user's devices as tools of the assistant; a tool two devices offer (two
   * browsers) is one, answered by the device in use.
   */
  toolsFor(userId: string): AiTool[] {
    const byName = new Map<string, AiTool>();
    for (const device of this.online(userId)) {
      for (const spec of device.tools) {
        if (!byName.has(spec.name)) {
          byName.set(spec.name, {
            name: spec.name,
            module: device.kind,
            description: `${spec.description} (from the user's device "${device.name}", online now)`,
            parameters: spec.inputSchema,
            writes: spec.writes,
            handler: (owner, args) => this.call(owner, spec.name, args),
          });
        }
      }
    }
    return [...byName.values()];
  }

  /** Runs a tool on the device in use that offers it. */
  call(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const device = this.online(userId).find((one) => one.tools.some((tool) => tool.name === name));
    if (!device) {
      return Promise.reject(new Error(`No device of the user offers ${name} now`));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`The device "${device.name}" did not answer`));
      }, CALL_TIMEOUT_MS);
      this.waiting.set(id, { resolve, reject, timer });
      device.send({ type: 'call', id, name, args });
    });
  }

  private settle(callId: string, finish: (call: Waiting) => void): void {
    const call = this.waiting.get(callId);
    if (call) {
      clearTimeout(call.timer);
      this.waiting.delete(callId);
      finish(call);
    }
  }
}

/** A device names its tools: only names of its own kind, a few dozen at most. */
function valid(tools: DeviceToolSpec[], kind: DeviceKind): DeviceToolSpec[] {
  return (Array.isArray(tools) ? tools : [])
    .filter(
      (tool) =>
        typeof tool?.name === 'string' &&
        DEVICE_TOOL_NAME.test(tool.name) &&
        tool.name.startsWith(`${kind}_`) &&
        typeof tool.description === 'string' &&
        typeof tool.inputSchema === 'object',
    )
    .slice(0, 50)
    .map((tool) => ({
      name: tool.name,
      description: tool.description.slice(0, 1000),
      inputSchema: tool.inputSchema,
      writes: tool.writes === true,
    }));
}
