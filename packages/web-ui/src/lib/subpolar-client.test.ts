import { afterEach, expect, test, vi } from "vitest";

import { SubpolarWebSocketClient } from "./subpolar-client";

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState = 0;
  closeCode: number | undefined;
  closeReason: string | undefined;
  send(value: string): void { this.sent.push(value); }
  close(code?: number, reason?: string): void { this.closeCode = code; this.closeReason = reason; this.readyState = 3; }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  message(value: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
  closed(): void { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

afterEach(() => vi.useRealTimers());

test("browser client sends authenticated chat starts and cancellations over WebSocket", async () => {
  const socket = new FakeSocket();
  const client = new SubpolarWebSocketClient({ url: "ws://localhost/v1/ws", socketFactory: () => socket as unknown as WebSocket });
  socket.open();
  await client.start({ requestId: "request-1", model: "test", messages: [{ role: "user", content: "hi" }] });
  await client.cancel("request-1");
  expect(JSON.parse(socket.sent[0] as string).type).toBe("chat.start");
  expect(JSON.parse(socket.sent[1] as string).type).toBe("chat.cancel");
});

test("browser client renders versioned events in sequence order and tracks a cursor", async () => {
  const socket = new FakeSocket();
  const events: number[] = [];
  const client = new SubpolarWebSocketClient({
    url: "ws://localhost/v1/ws",
    socketFactory: () => socket as unknown as WebSocket,
    onEvent: event => { if (event.sequence !== undefined) events.push(event.sequence); },
  });
  socket.open();
  await client.start({ requestId: "request-2", model: "test", messages: [{ role: "user", content: "hi" }] });
  socket.message({ protocol: "subpolar.v1", requestId: "request-2", sequence: 1, event: { type: "message.complete" } });
  socket.message({ protocol: "subpolar.v1", requestId: "request-2", sequence: 0, event: { type: "message.start" } });
  socket.message({ protocol: "subpolar.v1", requestId: "request-2", sequence: 1, event: { type: "message.complete" } });
  await Promise.resolve();
  expect(events).toEqual([0, 1]);
  expect(client.getCursor("request-2")).toEqual({ requestId: "request-2", sequence: 1 });
});

test("browser client bounds received frames instead of growing an unbounded queue", () => {
  const socket = new FakeSocket();
  const client = new SubpolarWebSocketClient({
    url: "ws://localhost/v1/ws",
    socketFactory: () => socket as unknown as WebSocket,
    maxBufferedEvents: 1,
  });
  socket.open();
  socket.message({ protocol: "subpolar.v1", requestId: "request-3", sequence: 1, event: { type: "message.delta" } });
  socket.message({ protocol: "subpolar.v1", requestId: "request-3", sequence: 2, event: { type: "message.delta" } });
  expect(socket.closeCode).toBe(1009);
  void client;
});

test("browser client sends heartbeat and resumes only after server capability advertisement", async () => {
  vi.useFakeTimers();
  const first = new FakeSocket();
  const second = new FakeSocket();
  const sockets = [first, second];
  const client = new SubpolarWebSocketClient({
    url: "ws://localhost/v1/ws",
    socketFactory: () => sockets.shift() as unknown as WebSocket,
    heartbeatIntervalMs: 10,
    heartbeatTimeoutMs: 30,
    reconnect: true,
    reconnectDelayMs: 1,
    maxReconnectAttempts: 1,
  });
  first.open();
  first.message({ protocol: "subpolar.v1", type: "connected", features: ["heartbeat", "resume"] });
  await client.start({ requestId: "request-4", model: "test", messages: [{ role: "user", content: "hi" }] });
  first.message({ protocol: "subpolar.v1", requestId: "request-4", sequence: 0, event: { type: "message.start" } });
  await Promise.resolve();
  vi.advanceTimersByTime(10);
  expect(JSON.parse(first.sent.at(-1) as string).type).toBe("heartbeat");
  first.closed();
  vi.advanceTimersByTime(1);
  second.open();
  expect(JSON.parse(second.sent.at(-1) as string).cursor).toBe(0);
});
