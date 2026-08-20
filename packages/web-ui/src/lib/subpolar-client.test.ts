import { expect, test } from "vitest";

import { isSubpolarTerminalEvent, parseSubpolarSocketEvent, SubpolarWebSocketClient } from "./subpolar-client";

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState = 0;
  send(value: string): void { this.sent.push(value); }
  close(): void { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  message(value: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: JSON.stringify(value) });
    this.dispatchEvent(event);
  }
}

test("browser client sends authenticated chat starts and cancellations over WebSocket", async () => {
  const socket = new FakeSocket();
  const client = new SubpolarWebSocketClient({ url: "ws://localhost/v1/ws", socketFactory: () => socket as unknown as WebSocket });
  socket.open();
  await client.start({ requestId: "request-1", model: "test", messages: [{ role: "user", content: "hi" }] });
  await client.cancel("request-1");
  expect(JSON.parse(socket.sent[0] as string).type).toBe("chat.start");
  expect(JSON.parse(socket.sent[1] as string).type).toBe("chat.cancel");
});

test("strictly parses protocol envelopes and recognizes terminal events", () => {
  const event = parseSubpolarSocketEvent({
    protocol: "subpolar.v1",
    requestId: "request-1",
    sequence: 0,
    event: { type: "message.complete", session_id: "session-1", payload: { outcome: "completed" } },
  });
  expect(isSubpolarTerminalEvent(event)).toBe(true);
  expect(() => parseSubpolarSocketEvent({ protocol: "subpolar.v1", type: "message.delta" })).toThrow();
  expect(() => parseSubpolarSocketEvent({ protocol: "wrong.v1", type: "connected" })).toThrow();
});

test("rejects duplicate event sequences without delivering them", async () => {
  const socket = new FakeSocket();
  const events: unknown[] = [];
  const protocolErrors: Error[] = [];
  const client = new SubpolarWebSocketClient({
    url: "ws://localhost/v1/ws",
    socketFactory: () => socket as unknown as WebSocket,
    onEvent: event => events.push(event),
    onProtocolError: error => protocolErrors.push(error),
  });
  socket.open();
  await client.start({ requestId: "request-1", model: "test", messages: [{ role: "user", content: "hi" }] });
  const message = (sequence: number) => ({ protocol: "subpolar.v1", requestId: "request-1", sequence, event: { type: "message.delta", session_id: "session-1", payload: { text: "hi" } } });
  socket.message(message(0));
  socket.message(message(0));
  expect(events).toHaveLength(1);
  expect(protocolErrors).toHaveLength(1);
  client.close();
});
