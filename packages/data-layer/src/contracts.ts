export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
};

export type ToolPolicy = "allow" | "ask" | "auto" | "deny";

export type ToolPolicySnapshot = {
  toolName: string;
  policy: ToolPolicy;
};

export type TransportEvent =
  | { type: "message.delta"; sessionId: string; delta: string }
  | { type: "message.completed"; sessionId: string; message: ChatMessage }
  | { type: "error"; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function isChatMessage(value: unknown): value is ChatMessage {
  return isRecord(value) && isChatRole(value.role) && typeof value.content === "string";
}

export function parseTransportEvent(value: unknown): TransportEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "message.delta" && typeof value.sessionId === "string" && typeof value.delta === "string") {
    return { type: "message.delta", sessionId: value.sessionId, delta: value.delta };
  }
  if (value.type === "message.completed" && typeof value.sessionId === "string" && isChatMessage(value.message)) {
    return { type: "message.completed", sessionId: value.sessionId, message: value.message };
  }
  if (value.type === "error" && typeof value.code === "string" && typeof value.message === "string") {
    return { type: "error", code: value.code, message: value.message };
  }
  return null;
}
