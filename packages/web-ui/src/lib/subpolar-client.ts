export type SubpolarChatRequest = {
  readonly requestId: string;
  readonly model: string;
  readonly messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[];
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly agentId?: string;
};

export type SubpolarSocketEvent = {
  readonly protocol: "subpolar.v1";
  readonly requestId?: string;
  readonly sequence?: number;
  readonly event?: Record<string, unknown>;
  readonly type?: string;
  readonly code?: string;
  readonly message?: string;
  readonly features?: readonly string[];
};

export type SubpolarReconnectCursor = {
  readonly requestId: string;
  readonly sequence: number;
};

export type SubpolarWebSocketOptions = {
  readonly url?: string;
  readonly socketFactory?: (url: string) => WebSocket;
  readonly onEvent?: (event: SubpolarSocketEvent) => void;
  readonly onClose?: (event?: CloseEvent) => void;
  readonly onReconnect?: (cursor: SubpolarReconnectCursor | undefined) => void;
  /** Keep the socket alive only when the server advertises the frame. */
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
  /** Maximum number of received frames waiting for application rendering. */
  readonly maxBufferedEvents?: number;
  readonly reconnect?: boolean;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
};

const DEFAULT_MAX_BUFFERED_EVENTS = 256;
const DEFAULT_RECONNECT_DELAY_MS = 500;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

function csrfCookie(): string {
  if (typeof document === "undefined") return "";
  const value = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("subpolar_csrf="));
  return value === undefined ? "" : decodeURIComponent(value.slice("subpolar_csrf=".length));
}

function defaultUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/v1/ws`;
}

function parseEvent(value: unknown): SubpolarSocketEvent | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.protocol !== "subpolar.v1") return undefined;
  if (record.sequence !== undefined && (!Number.isInteger(record.sequence) || Number(record.sequence) < 0)) return undefined;
  return record as SubpolarSocketEvent;
}

function eventKey(event: SubpolarSocketEvent): string {
  return event.requestId ?? "__unscoped__";
}

export class SubpolarWebSocketClient {
  private readonly url: string;
  private readonly socketFactory: (url: string) => WebSocket;
  private readonly onEvent: ((event: SubpolarSocketEvent) => void) | undefined;
  private readonly onClose: ((event?: CloseEvent) => void) | undefined;
  private readonly onReconnect: ((cursor: SubpolarReconnectCursor | undefined) => void) | undefined;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxBufferedEvents: number;
  private readonly reconnectEnabled: boolean;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private socket: WebSocket | null = null;
  private opened: Promise<void>;
  private resolveOpened: (() => void) | undefined;
  private rejectOpened: ((reason: Error) => void) | undefined;
  private explicitlyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastActivityAt = 0;
  private heartbeatSupported = false;
  private resumeSupported = false;
  private startedRequest: SubpolarChatRequest | undefined;
  private readonly cursors = new Map<string, number>();
  private readonly expectedSequences = new Map<string, number>();
  private readonly pendingByRequest = new Map<string, Map<number, SubpolarSocketEvent>>();
  private readonly eventQueue: SubpolarSocketEvent[] = [];
  private drainScheduled = false;

  constructor(options: SubpolarWebSocketOptions = {}) {
    this.url = options.url ?? defaultUrl();
    this.socketFactory = options.socketFactory ?? (url => new WebSocket(url));
    this.onEvent = options.onEvent;
    this.onClose = options.onClose;
    this.onReconnect = options.onReconnect;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 0;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? this.heartbeatIntervalMs * 2;
    this.maxBufferedEvents = Math.max(1, options.maxBufferedEvents ?? DEFAULT_MAX_BUFFERED_EVENTS);
    this.reconnectEnabled = options.reconnect ?? false;
    this.reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);
    this.maxReconnectAttempts = Math.max(0, options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS);
    this.opened = this.createSocket();
  }

  getCursor(requestId: string): SubpolarReconnectCursor | undefined {
    const sequence = this.cursors.get(requestId);
    return sequence === undefined ? undefined : { requestId, sequence };
  }

  async start(request: SubpolarChatRequest): Promise<void> {
    this.startedRequest = request;
    await this.opened;
    this.sendStart(request);
  }

  async cancel(requestId: string): Promise<void> {
    await this.opened;
    this.send({ type: "chat.cancel", requestId });
  }

  close(): void {
    this.explicitlyClosed = true;
    this.startedRequest = undefined;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  private createSocket(): Promise<void> {
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    this.explicitlyClosed = false;
    this.lastActivityAt = Date.now();
    this.opened = new Promise<void>((resolve, reject) => {
      this.resolveOpened = resolve;
      this.rejectOpened = reject;
    });

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.lastActivityAt = Date.now();
      this.startHeartbeat();
      this.resolveOpened?.();
      this.resolveOpened = undefined;
      this.rejectOpened = undefined;
      if (this.startedRequest !== undefined && this.resumeSupported) this.sendStart(this.startedRequest);
      this.onReconnect?.(this.startedRequest === undefined ? undefined : this.getCursor(this.startedRequest.requestId));
    }, { once: true });
    socket.addEventListener("error", () => {
      const reject = this.rejectOpened;
      this.rejectOpened = undefined;
      this.resolveOpened = undefined;
      reject?.(new Error("WebSocket connection failed"));
    }, { once: true });
    socket.addEventListener("message", event => this.receive(event.data));
    socket.addEventListener("close", event => this.handleClose(event));
    return this.opened;
  }

  private handleClose(event: CloseEvent): void {
    if (this.socket !== null && this.socket.readyState !== 3) return;
    this.clearHeartbeat();
    const reject = this.rejectOpened;
    this.rejectOpened = undefined;
    this.resolveOpened = undefined;
    reject?.(new Error("WebSocket connection closed"));
    this.onClose?.(event);
    if (!this.explicitlyClosed && this.reconnectEnabled && this.resumeSupported && this.startedRequest !== undefined && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        this.opened = this.createSocket();
      }, this.reconnectDelayMs * this.reconnectAttempts);
    }
  }

  private receive(raw: unknown): void {
    this.lastActivityAt = Date.now();
    let parsed: SubpolarSocketEvent | undefined;
    try { parsed = parseEvent(JSON.parse(String(raw)) as unknown); } catch { return; }
    if (parsed === undefined) return;
    const type = parsed.type ?? (typeof parsed.event?.type === "string" ? parsed.event.type : undefined);
    if (type === "connected") {
      const features = parsed.features ?? (Array.isArray(parsed.event?.features) ? parsed.event.features.filter((item): item is string => typeof item === "string") : []);
      this.heartbeatSupported = features.includes("heartbeat");
      this.resumeSupported = features.includes("resume") || features.includes("cursor");
    }
    if (type === "heartbeat" || type === "heartbeat.ack" || type === "pong") this.lastActivityAt = Date.now();
    this.enqueue(parsed);
  }

  private enqueue(event: SubpolarSocketEvent): void {
    if (event.sequence === undefined) {
      this.eventQueue.push(event);
    } else {
      const key = eventKey(event);
      const expected = this.expectedSequences.get(key) ?? 0;
      if (event.sequence < expected) return;
      let pending = this.pendingByRequest.get(key);
      if (pending === undefined) {
        pending = new Map();
        this.pendingByRequest.set(key, pending);
      }
      if (pending.has(event.sequence)) return;
      pending.set(event.sequence, event);
      let next = expected;
      while (pending.has(next)) {
        const ordered = pending.get(next) as SubpolarSocketEvent;
        pending.delete(next);
        this.eventQueue.push(ordered);
        next += 1;
      }
      this.expectedSequences.set(key, next);
      if (pending.size === 0) this.pendingByRequest.delete(key);
    }
    if (this.eventQueue.length + [...this.pendingByRequest.values()].reduce((total, pending) => total + pending.size, 0) > this.maxBufferedEvents) {
      this.socket?.close(1009, "event buffer exceeded");
      return;
    }
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift() as SubpolarSocketEvent;
        if (event.requestId !== undefined && event.sequence !== undefined) this.cursors.set(event.requestId, event.sequence);
        try { this.onEvent?.(event); } catch { /* A renderer must not stop transport delivery. */ }
      }
    });
  }

  private sendStart(request: SubpolarChatRequest): void {
    const cursor = this.resumeSupported ? this.getCursor(request.requestId)?.sequence : undefined;
    this.send({
      ...request,
      type: "chat.start",
      csrfToken: csrfCookie(),
      ...(cursor === undefined ? {} : { cursor }),
    });
  }

  private send(value: Record<string, unknown>): void {
    if (this.socket?.readyState !== 1) throw new Error("WebSocket is not open");
    this.socket.send(JSON.stringify(value));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    if (this.heartbeatIntervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState !== 1) return;
      if (this.heartbeatSupported) {
        try { this.send({ type: "heartbeat" }); } catch { return; }
      }
      if (this.heartbeatSupported && this.heartbeatTimeoutMs > 0 && Date.now() - this.lastActivityAt > this.heartbeatTimeoutMs) this.socket.close(4000, "heartbeat timeout");
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
}
