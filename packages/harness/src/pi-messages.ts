import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Model, Message, TextContent, ThinkingContent, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ProviderContent, ProviderMessage } from "chat-provider-interface";

function parseArguments(value: string | undefined): Record<string, unknown> {
	if (value === undefined || value.trim() === "") return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

function textContent(content: ProviderContent): string {
	if (typeof content === "string") return content;
	return content.map((part) => {
		switch (part.type) {
			case "text":
			case "reasoning":
				return part.text;
			case "tool-call":
				return `[tool call: ${part.name}]`;
			case "tool-result":
				return typeof part.content === "string" ? part.content : textContent(part.content);
			default:
				return "";
		}
	}).filter(Boolean).join("\n");
}

function toAssistantContent(content: ProviderContent): (TextContent | ThinkingContent)[] {
	if (typeof content === "string") return content === "" ? [] : [{ type: "text", text: content }];
	const result: (TextContent | ThinkingContent)[] = [];
	for (const part of content) {
		if (part.type === "text") result.push({ type: "text", text: part.text });
		if (part.type === "reasoning") result.push({ type: "thinking", thinking: part.text });
	}
	return result;
}

function toContent(content: ProviderContent): TextContent[] {
	return toAssistantContent(content).flatMap((part) => part.type === "text" ? [part] : []);
}

function toToolCalls(message: ProviderMessage): ToolCall[] {
	const calls = [...(message.toolCalls ?? [])];
	if (typeof message.content !== "string") {
		for (const part of message.content) {
			if (part.type === "tool-call" && !calls.some((call) => call.id === part.id)) calls.push(part);
		}
	}
	return calls.map((call) => ({ type: "toolCall", id: call.id, name: call.name, arguments: parseArguments(call.arguments) }));
}

function toUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

/** Convert persisted provider-neutral messages into Pi's canonical message model. */
export function toPiMessages(messages: readonly ProviderMessage[], model: Model<any>): Message[] {
	const result: Message[] = [];
	for (const message of messages) {
		if (message.role === "system") continue;
		if (message.role === "user") {
			result.push({ role: "user", content: textContent(message.content) || toContent(message.content), timestamp: Date.now() });
			continue;
		}
		if (message.role === "assistant") {
			result.push({
				role: "assistant",
				content: [...toAssistantContent(message.content), ...toToolCalls(message)],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: toUsage(),
				stopReason: message.toolCalls?.length ? "toolUse" : "stop",
				timestamp: Date.now(),
			});
			continue;
		}
		const toolMessage: ToolResultMessage = {
			role: "toolResult",
			toolCallId: message.toolCallId ?? "unknown-tool-call",
			toolName: message.name ?? "tool",
			content: toContent(message.content),
			isError: false,
			timestamp: Date.now(),
		};
		result.push(toolMessage);
	}
	return result;
}

export function hydratePiSession(
	session: AgentSession,
	messages: readonly ProviderMessage[],
	model: Model<any>,
	options: { persist?: boolean } = {},
): void {
	const hydrated = toPiMessages(messages, model);
	if (options.persist && session.sessionManager.isPersisted()) {
		for (const message of hydrated) session.sessionManager.appendMessage(message);
	}
	session.messages.push(...hydrated);
}
