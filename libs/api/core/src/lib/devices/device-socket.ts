import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DEVICE_KINDS, DeviceMessage, ServerToDevice } from '@pd/contracts';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { AccessPayload } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { DeviceToolsService } from './device-tools.service';

const PATH = '/api/devices/socket';
/** A device must say who it is this soon after connecting. */
const HELLO_WITHIN_MS = 10_000;
/** Whether the device's session still exists (signed out on it: the socket closes). */
const SESSION_CHECK_MS = 5 * 60_000;
/** One message at most this big: a page's text is cut by the device before. */
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

/**
 * The WebSocket the user's devices hold to offer their tools (`/api/devices/socket`): the
 * first message is a `hello` with the session's access token and the tools; then the server
 * sends calls and the device answers them. Lives on the API's own HTTP server.
 */
@Injectable()
export class DeviceSocket implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceSocket.name);
  private server: WebSocketServer | null = null;

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly tools: DeviceToolsService,
  ) {}

  onApplicationBootstrap(): void {
    const http = this.adapter.httpAdapter?.getHttpServer();
    if (!http) {
      return;
    }
    this.server = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    http.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(request.url ?? '/', 'http://local').pathname !== PATH) {
        return;
      }
      this.server?.handleUpgrade(request, socket, head, (ws) => this.accept(ws));
    });
  }

  onApplicationShutdown(): void {
    this.server?.close();
  }

  private accept(ws: WebSocket): void {
    const deviceId = randomUUID();
    const send = (message: ServerToDevice) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };
    let session: { userId: string; sessionId: string } | null = null;
    const helloTimer = setTimeout(() => !session && ws.close(4401, 'No hello'), HELLO_WITHIN_MS);
    const sessionTimer = setInterval(async () => {
      if (session && !(await this.sessions.isAlive(session.sessionId))) {
        send({ type: 'unauthorized' });
        ws.close(4401, 'Signed out');
      }
    }, SESSION_CHECK_MS);

    ws.on('message', async (raw) => {
      let message: DeviceMessage;
      try {
        message = JSON.parse(raw.toString()) as DeviceMessage;
      } catch {
        return;
      }
      if (message.type === 'hello') {
        const payload = await this.jwt
          .verifyAsync<AccessPayload>(String(message.accessToken))
          .catch(() => null);
        if (!payload?.sid || !(await this.sessions.isAlive(payload.sid))) {
          send({ type: 'unauthorized' });
          return;
        }
        if (!DEVICE_KINDS.includes(message.kind)) {
          ws.close(4400, 'Unknown kind');
          return;
        }
        session = { userId: payload.sub, sessionId: payload.sid };
        this.tools.connected({
          id: deviceId,
          userId: payload.sub,
          kind: message.kind,
          name: String(message.name ?? message.kind).slice(0, 80),
          tools: message.tools,
          activeAt: Date.now(),
          send,
        });
        send({ type: 'welcome' });
        return;
      }
      if (!session) {
        return;
      }
      switch (message.type) {
        case 'tools':
          this.tools.updateTools(deviceId, message.tools);
          break;
        case 'active':
          this.tools.markActive(deviceId);
          break;
        case 'result':
          this.tools.answered(String(message.id), message.value);
          break;
        case 'error':
          this.tools.failed(String(message.id), String(message.message).slice(0, 500));
          break;
        case 'ping':
          send({ type: 'pong' });
          break;
      }
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      clearInterval(sessionTimer);
      this.tools.disconnected(deviceId);
    });
    ws.on('error', (error) => this.logger.warn(`A device socket failed: ${error.message}`));
  }
}
