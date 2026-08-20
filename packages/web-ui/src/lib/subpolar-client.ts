export type SubpolarChatRequest = {
  readonly requestId: string;
  readonly model: string;
  readonly messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[];
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly permissionMode?: "full" | "ask" | "read-only";
};

export type SubpolarSocketEvent = {
  readonly protocol: "subpolar.v1";
  readonly requestId?: string;
  readonly sequence?: number;
  readonly event?: Record<string, unknown>;
  readonly type?: string;
  readonly code?: string;
  readonly message?: string;
};

export type SubpolarWebSocketOptions = {
  readonly url?: string;
  readonly socketFactory?: (url: string) => WebSocket;
  readonly onEvent?: (event: SubpolarSocketEvent) => void;
  readonly onClose?: (reconnecting: boolean, reason?: "cancelled" | "closed") => void;
  readonly onProtocolError?: (error: Error) => void;
  readonly maxReconnectAttempts?: number;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaxDelayMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
};

const PROTOCOL = "subpolar.v1" as const;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const EVENT_TYPES = new Set([
  "message.start",
  "message.delta",
  "message.complete",
  "reasoning.delta",
  "status.update",
  "approval.request",
  "tool.start",
  "tool.generating",
  "tool.complete",
  "error",
]);

type ActiveRequest = {
  readonly request: SubpolarChatRequest;
  sent: boolean;
};

type SocketWithHandlers = WebSocket & EventTarget;

function csrfCookie(): string {
  if (typeof document === "undefined") return "";
  const value = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("subpolar_csrf="));
  return value === undefined ? "" : decodeURIComponent(value.slice("subpolar_csrf=".length));
}

function defaultUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/v1/ws`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid WebSocket event: ${field}`);
  return value;
}

function parseEvent(value: unknown): SubpolarSocketEvent {
  const outer = record(value);
  if (outer === undefined || outer.protocol !== PROTOCOL) throw new Error("Invalid WebSocket protocol envelope");

  const type = outer.type;
  const nested = outer.event;
  if (nested !== undefined) {
    if (type !== undefined || typeof outer.requestId !== "string" || outer.requestId.length === 0 || !Number.isInteger(outer.sequence) || (outer.sequence as number) < 0) {
      throw new Error("Invalid WebSocket event envelope");
    }
    const event = record(nested);
    if (event === undefined || typeof event.type !== "string" || !EVENT_TYPES.has(event.type) || typeof event.session_id !== "string" || event.session_id.length === 0 || record(event.payload) === undefined) {
      throw new Error("Invalid WebSocket event payload");
    }
    return {
      protocol: PROTOCOL,
      requestId: outer.requestId,
      sequence: outer.sequence as number,
      event,
    };
  }

  if (type !== "connected" && type !== "error") throw new Error("Invalid WebSocket control event");
  if (outer.requestId !== undefined && (typeof outer.requestId !== "string" || outer.requestId.length === 0)) throw new Error("Invalid WebSocket requestId");
  if (outer.sequence !== undefined && (!Number.isInteger(outer.sequence) || (outer.sequence as number) < 0)) throw new Error("Invalid WebSocket sequence");
  if (type === "error" && (typeof outer.code !== "string" || outer.code.length === 0)) throw new Error("Invalid WebSocket error event");
  if (outer.message !== undefined && typeof outer.message !== "string") throw new Error("Invalid WebSocket error message");
  return {
    protocol: PROTOCOL,
    type,
    ...(outer.requestId === undefined ? {} : { requestId: outer.requestId }),
    ...(outer.sequence === undefined ? {} : { sequence: outer.sequence as number }),
    ...(outer.code === undefined ? {} : { code: requiredString(outer.code, "code") }),
    ...(outer.message === undefined ? {} : { message: outer.message as string }),
  };
}

export function parseSubpolarSocketEvent(value: unknown): SubpolarSocketEvent {
  return parseEvent(value);
}

export function subpolarEventType(event: SubpolarSocketEvent): string | undefined {
  const inner = record(event.event);
  return typeof inner?.type === "string" ? inner.type : event.type;
}

export function isSubpolarTerminalEvent(event: SubpolarSocketEvent): boolean {
  const type = subpolarEventType(event);
  return type === "message.complete" || type === "error";
}

export class SubpolarWebSocketClient {
  private readonly url: string;
  private readonly socketFactory: (url: string) => WebSocket;
  private readonly onEvent: ((event: SubpolarSocketEvent) => void) | undefined;
  private readonly onClose: ((reconnecting: boolean, reason?: "cancelled" | "closed") => void) | undefined;
  private readonly onProtocolError: ((error: Error) => void) | undefined;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private socket: SocketWithHandlers | null = null;
  private opened: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectAttempts = 0;
  private lastActivity = 0;
  private manuallyClosed = false;
  private closeReason: "cancelled" | "closed" | undefined;
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly lastSequence = new Map<string, number>();

  constructor(options: SubpolarWebSocketOptions = {}) {
    this.url = options.url ?? defaultUrl();
    this.socketFactory = options.socketFactory ?? (url => new WebSocket(url));
    this.onEvent = options.onEvent;
    this.onClose = options.onClose;
    this.onProtocolError = options.onProtocolError;
    this.maxReconnectAttempts = Math.max(0, Math.floor(options.maxReconnectAttempts ?? 5));
    this.reconnectBaseDelayMs = Math.max(1, options.reconnectBaseDelayMs ?? 250);
    this.reconnectMaxDelayMs = Math.max(this.reconnectBaseDelayMs, options.reconnectMaxDelayMs ?? 5_000);
    this.heartbeatIntervalMs = Math.max(0, options.heartbeatIntervalMs ?? 15_000);
    this.heartbeatTimeoutMs = Math.max(this.heartbeatIntervalMs, options.heartbeatTimeoutMs ?? 45_000);
    void this.connect().catch(() => undefined);
  }

  private connect(): Promise<void> {
    if (this.manuallyClosed) return Promise.reject(new Error("WebSocket client is closed"));
    if (this.socket?.readyState === SOCKET_OPEN && this.opened !== null) return this.opened;
    if (this.opened !== null) return this.opened;

    const socket = this.socketFactory(this.url) as SocketWithHandlers;
    this.socket = socket;
    this.lastActivity = Date.now();
    let opened = false;
    let rejectOpened: (reason: Error) => void = () => undefined;
    this.opened = new Promise<void>((resolve, reject) => {
      rejectOpened = reject;
      socket.addEventListener("open", () => {
        opened = true;
        this.startHeartbeat();
        resolve();
        this.flushRequests();
      }, { once: true });
      socket.addEventListener("error", () => {
        if (!opened) {
          opened = true;
          reject(new Error("WebSocket connection failed"));
        }
      }, { once: true });
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      this.lastActivity = Date.now();
      try {
        const parsed = parseEvent(JSON.parse(String(event.data)) as unknown);
        if (parsed.requestId !== undefined && parsed.sequence !== undefined) {
          const previous = this.lastSequence.get(parsed.requestId);
          if (previous !== undefined && parsed.sequence <= previous) throw new Error("WebSocket event sequence is not monotonic");
          this.lastSequence.set(parsed.requestId, parsed.sequence);
        }
        this.onEvent?.(parsed);
        if (parsed.requestId !== undefined && isSubpolarTerminalEvent(parsed)) this.activeRequests.delete(parsed.requestId);
      } catch (reason) {
        const error = reason instanceof Error ? reason : new Error("Invalid WebSocket event");
        this.onProtocolError?.(error);
        this.closeSocket();
      }
    });
    socket.addEventListener("close", () => {
      if (!opened) {
        opened = true;
        rejectOpened(new Error("WebSocket connection closed before opening"));
      }
      this.handleClose(socket);
    });
    return this.opened;
  }

  private flushRequests(): void {
    if (this.socket?.readyState !== SOCKET_OPEN) return;
    for (const [requestId, active] of this.activeRequests) {
      if (active.sent) continue;
      this.socket.send(JSON.stringify({ ...active.request, type: "chat.start", csrfToken: csrfCookie() }));
      active.sent = true;
      this.lastSequence.delete(requestId);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== undefined || this.heartbeatIntervalMs === 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.activeRequests.size === 0 || this.socket?.readyState !== SOCKET_OPEN) return;
      if (Date.now() - this.lastActivity > this.heartbeatTimeoutMs) this.closeSocket();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === undefined) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private closeSocket(): void {
    if (this.socket?.readyState === SOCKET_CLOSED || this.socket?.readyState === SOCKET_CLOSING) return;
    this.socket?.close();
  }

  private handleClose(socket: SocketWithHandlers): void {
    if (this.socket !== socket) return;
    this.stopHeartbeat();
    this.socket = null;
    this.opened = null;
    for (const active of this.activeRequests.values()) active.sent = false;
    this.lastSequence.clear();
    if (this.manuallyClosed || this.activeRequests.size === 0) {
      this.onClose?.(false, this.closeReason ?? "closed");
      this.closeReason = undefined;
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.activeRequests.clear();
      this.lastSequence.clear();
      this.onClose?.(false, "closed");
      return;
    }
    this.onClose?.(true);
    const delay = Math.min(this.reconnectMaxDelayMs, this.reconnectBaseDelayMs * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => undefined);
    }, delay);
  }

  private sendCancel(requestId: string): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(JSON.stringify({ type: "chat.cancel", requestId }));
  }

  async start(request: SubpolarChatRequest): Promise<void> {
    if (!request.requestId) throw new Error("requestId is required");
    if (this.activeRequests.has(request.requestId)) throw new Error("requestId is already active");
    this.activeRequests.set(request.requestId, { request, sent: false });
    try {
      await this.connect();
      this.flushRequests();
    } catch (reason) {
      this.activeRequests.delete(request.requestId);
      throw reason;
    }
  }

  async cancel(requestId: string): Promise<void> {
    const active = this.activeRequests.get(requestId);
    this.activeRequests.delete(requestId);
    this.lastSequence.delete(requestId);
    if (active === undefined && this.socket?.readyState !== SOCKET_OPEN) return;
    if (this.socket?.readyState === SOCKET_OPEN) this.sendCancel(requestId);
    else if (!this.manuallyClosed) await this.connect().then(() => this.sendCancel(requestId)).catch(() => undefined);
    if (this.activeRequests.size === 0) {
      this.closeReason = "cancelled";
      this.close();
    }
  }

  respondToApproval(callId: string, decision: "allow" | "deny"): void {
    if (!callId || this.socket?.readyState !== SOCKET_OPEN) return;
    this.socket.send(JSON.stringify({ type: "approval.respond", callId, decision }));
  }

  disconnect(): void {
    this.close();
  }

  close(): void {
    if (this.manuallyClosed) return;
    this.manuallyClosed = true;
    if (this.closeReason === undefined) this.closeReason = "closed";
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const requestId of this.activeRequests.keys()) this.sendCancel(requestId);
    this.activeRequests.clear();
    this.lastSequence.clear();
    this.closeSocket();
  }
}
