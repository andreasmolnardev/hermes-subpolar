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
};

export type SubpolarWebSocketOptions = {
  readonly url?: string;
  readonly socketFactory?: (url: string) => WebSocket;
  readonly onEvent?: (event: SubpolarSocketEvent) => void;
  readonly onClose?: () => void;
};

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
  return record as SubpolarSocketEvent;
}

export class SubpolarWebSocketClient {
  private readonly socket: WebSocket;
  private readonly onEvent: ((event: SubpolarSocketEvent) => void) | undefined;
  private readonly onClose: (() => void) | undefined;
  private opened: Promise<void>;

  constructor(options: SubpolarWebSocketOptions = {}) {
    this.onEvent = options.onEvent;
    this.onClose = options.onClose;
    this.socket = (options.socketFactory ?? (url => new WebSocket(url)))(options.url ?? defaultUrl());
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
    });
    this.socket.addEventListener("message", event => {
      try {
        const parsed = parseEvent(JSON.parse(String(event.data)) as unknown);
        if (parsed !== undefined) this.onEvent?.(parsed);
      } catch {
        // Malformed browser events are ignored; the server contract remains fail-closed.
      }
    });
    this.socket.addEventListener("close", () => this.onClose?.());
  }

  async start(request: SubpolarChatRequest): Promise<void> {
    await this.opened;
    this.socket.send(JSON.stringify({ ...request, type: "chat.start", csrfToken: csrfCookie() }));
  }

  async cancel(requestId: string): Promise<void> {
    await this.opened;
    this.socket.send(JSON.stringify({ type: "chat.cancel", requestId }));
  }

  close(): void {
    this.socket.close();
  }
}
