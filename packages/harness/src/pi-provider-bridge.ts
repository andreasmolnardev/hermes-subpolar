import type { ChatProvider, ProviderContent, ProviderMessage, ProviderRequest, ProviderStreamEvent } from "chat-provider-interface";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStream,
	Context,
	Message,
	Model,
	Provider,
	ProviderStreams,
	ToolCall,
	ToolResultMessage,
	Usage,
} from "@earendil-works/pi-ai";
import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

export interface SubpolarPiProviderBridgeOptions {
	readonly providerId: string;
	readonly providerName?: string;
	readonly modelId: string;
	readonly chatProvider: ChatProvider;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
}

export interface SubpolarPiProviderBridge {
	readonly model: Model<Api>;
	readonly provider: Provider<Api>;
}

function contentText(content: ProviderContent): string {
	if (typeof content === "string") return content;
	return content.map((part) => {
		if (part.type === "text" || part.type === "reasoning") return part.text;
		if (part.type === "tool-result") return contentText(part.content);
		return "";
	}).filter(Boolean).join("\n");
}

function piContentText(content: Message["content"]): string {
	if (typeof content === "string") return content;
	return content.map((part) => {
		if (part.type === "text") return part.text;
		if (part.type === "thinking") return part.thinking;
		return "";
	}).filter(Boolean).join("\n");
}

function piMessagesToProvider(messages: readonly Message[]): ProviderMessage[] {
	return messages.map((message): ProviderMessage => {
		if (message.role === "user") {
			return { role: "user", content: typeof message.content === "string" ? message.content : piContentText(message.content) };
		}
		if (message.role === "assistant") {
			const toolCalls = message.content.filter((part): part is ToolCall => part.type === "toolCall").map((call) => ({
				id: call.id,
				name: call.name,
				arguments: JSON.stringify(call.arguments),
			}));
			return {
				role: "assistant",
				content: piContentText(message.content),
				...(toolCalls.length === 0 ? {} : { toolCalls }),
			};
		}
		return {
			role: "tool",
			toolCallId: message.toolCallId,
			name: message.toolName,
			content: piContentText(message.content),
		};
	});
}

function piRequest(context: Context, model: Model<Api>, options: { signal?: AbortSignal; temperature?: number; maxTokens?: number }): ProviderRequest {
	return {
		model: model.id,
		messages: [
			...(context.systemPrompt === undefined ? [] : [{ role: "system" as const, content: context.systemPrompt }]),
			...piMessagesToProvider(context.messages),
		],
		tools: (context.tools ?? []).map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters as never,
			policy: "allow" as const,
		})),
		...(options.signal === undefined ? {} : { signal: options.signal, cancellation: options.signal }),
		...(options.temperature === undefined && options.maxTokens === undefined ? {} : {
			options: {
				...(options.temperature === undefined ? {} : { temperature: options.temperature }),
				...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
			},
		}),
	};
}

function usage(value: { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number; cachedInputTokens?: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number } | undefined): Usage {
	return {
		input: value?.inputTokens ?? 0,
		output: value?.outputTokens ?? 0,
		cacheRead: value?.cachedInputTokens ?? value?.cacheReadInputTokens ?? 0,
		cacheWrite: value?.cacheCreationInputTokens ?? 0,
		reasoning: value?.reasoningTokens,
		totalTokens: value?.totalTokens ?? (value?.inputTokens ?? 0) + (value?.outputTokens ?? 0),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function finishReason(value: string | undefined): AssistantMessage["stopReason"] {
	if (value === "length") return "length";
	if (value === "tool_call") return "toolUse";
	if (value === "cancelled") return "aborted";
	if (value === "error") return "error";
	return "stop";
}

function bridgeStream(
	model: Model<Api>,
	chatProvider: ChatProvider,
	context: Context,
	options: { signal?: AbortSignal; temperature?: number; maxTokens?: number },
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	const text: string[] = [];
	const thinking: string[] = [];
	const toolCalls = new Map<string, ToolCall>();
	let currentUsage: Usage = usage(undefined);
	let startedText = false;
	let startedThinking = false;

	const partial = (stopReason: AssistantMessage["stopReason"] = "pending"): AssistantMessage => ({
		role: "assistant",
		content: [
			...(text.length === 0 ? [] : [{ type: "text" as const, text: text.join("") }]),
			...(thinking.length === 0 ? [] : [{ type: "thinking" as const, thinking: thinking.join("") }]),
			...toolCalls.values(),
		],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: currentUsage,
		stopReason,
		timestamp: Date.now(),
	});

	const consume = async (events: AsyncIterable<ProviderStreamEvent>): Promise<void> => {
		stream.push({ type: "start", partial: partial() });
		for await (const event of events) {
			switch (event.type) {
				case "text-delta":
					if (!startedText) {
						startedText = true;
						stream.push({ type: "text_start", contentIndex: 0, partial: partial() });
					}
					text.push(event.text);
					stream.push({ type: "text_delta", contentIndex: 0, delta: event.text, partial: partial() });
					break;
				case "reasoning-delta":
					if (!startedThinking) {
						startedThinking = true;
						stream.push({ type: "thinking_start", contentIndex: 0, partial: partial() });
					}
					thinking.push(event.text);
					stream.push({ type: "thinking_delta", contentIndex: 0, delta: event.text, partial: partial() });
					break;
				case "tool-call-delta":
					if (event.id !== undefined && event.name !== undefined) {
						const existing = toolCalls.get(event.id) ?? { type: "toolCall" as const, id: event.id, name: event.name, arguments: {} };
						toolCalls.set(event.id, existing);
						stream.push({ type: "toolcall_delta", contentIndex: toolCalls.size, delta: event.arguments ?? "", partial: partial() });
					}
					break;
				case "tool-call":
					toolCalls.set(event.id, { type: "toolCall", id: event.id, name: event.name, arguments: safeJson(event.arguments) });
					stream.push({ type: "toolcall_end", contentIndex: toolCalls.size, toolCall: toolCalls.get(event.id)!, partial: partial() });
					break;
				case "usage":
					currentUsage = usage({ ...event.usage });
					break;
				case "finish":
					stream.push({ type: "done", reason: finishReason(event.finishReason) as "stop" | "length" | "toolUse", message: partial(finishReason(event.finishReason)) });
					return;
				case "error":
					stream.push({ type: "error", reason: "error", error: { ...partial("error"), errorMessage: event.error.message } });
					return;
			}
		}
		stream.push({ type: "done", reason: "stop", message: partial("stop") });
	};

	void (async () => {
		try {
			const request = piRequest(context, model, options);
			if (chatProvider.stream === undefined) {
				const result = await chatProvider.complete(request);
				const message = providerResultMessage(model, result.message, result.usage);
				stream.push({ type: "start", partial: message });
				stream.push({ type: "done", reason: finishReason(result.finishReason) as "stop" | "length" | "toolUse", message });
				return;
			}
			await consume(await chatProvider.stream(request));
		} catch (error) {
			stream.push({ type: "error", reason: options.signal?.aborted ? "aborted" : "error", error: { ...partial(options.signal?.aborted ? "aborted" : "error"), errorMessage: error instanceof Error ? error.message : String(error) } });
		}
	})();
	return stream;
}

function safeJson(value: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

function providerResultMessage(model: Model<Api>, message: ProviderMessage, providerUsage: { inputTokens: number; outputTokens: number; totalTokens?: number; reasoningTokens?: number }): AssistantMessage {
	const toolCalls = (message.toolCalls ?? []).map((call) => ({ type: "toolCall" as const, id: call.id, name: call.name, arguments: safeJson(call.arguments) }));
	return {
		role: "assistant",
		content: [
			...(contentText(message.content) ? [{ type: "text" as const, text: contentText(message.content) }] : []),
			...toolCalls,
		],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: usage(providerUsage),
		stopReason: toolCalls.length === 0 ? "stop" : "toolUse",
		timestamp: Date.now(),
	};
}

export function createSubpolarPiProviderBridge(options: SubpolarPiProviderBridgeOptions): SubpolarPiProviderBridge {
	const api = "subpolar" as Api;
	const model: Model<Api> = {
		id: options.modelId,
		name: options.modelId,
		api,
		provider: options.providerId,
		baseUrl: "subpolar://provider",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: options.contextWindow ?? 128_000,
		maxTokens: options.maxTokens ?? 16_384,
	};
	const streams: ProviderStreams = {
		stream: (streamModel, context, streamOptions) => bridgeStream(streamModel, options.chatProvider, context, streamOptions ?? {}),
		streamSimple: (streamModel, context, streamOptions) => bridgeStream(streamModel, options.chatProvider, context, streamOptions ?? {}),
	};
	const provider = createProvider({
		id: options.providerId,
		name: options.providerName ?? options.providerId,
		models: [model],
		auth: { apiKey: { name: "Subpolar-managed credentials", resolve: async () => ({ auth: {} }) } },
		api: streams,
	});
	return { model, provider };
}
