import { expect, test } from "vitest";

import { SubpolarWebSocketClient } from "./subpolar-client";

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState = 0;
  send(value: string): void { this.sent.push(value); }
  close(): void { this.readyState = 3; }
  open(): void { this.readyState = 1; this.dispatchEvent(new Event("open")); }
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
