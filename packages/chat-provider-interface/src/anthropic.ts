import {
  createProviderRequestContext,
  normalizeProviderError,
  normalizeProviderFinishReason,
  normalizeProviderUsage,
  ProviderError,
  validateProviderRequest,
  validateProviderResult,
  validateProviderStreamEvent,
  type ChatProvider,
  type ProviderContent,
  type ProviderContentPart,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResult,
  type ProviderStreamEvent,
  type ProviderTool,
  type ProviderUsageInput
} from "./index";

export type AnthropicCredentials = { readonly apiKey: string };
export type AnthropicFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AnthropicProviderOptions = {
  readonly baseUrl: string;
  readonly credentials?: AnthropicCredentials;
  readonly credentialHandle?: string;
  readonly resolveCredentialHandle?: (handle: string) => AnthropicCredentials | Promise<AnthropicCredentials>;
  readonly fetch: AnthropicFetch;
  readonly headers?: Readonly<Record<string, string>>;
  readonly credentialHeader?: "x-api-key" | "authorization";
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;
}

function text(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map(part => {
    if (part.type === "text" || part.type === "reasoning") return part.text;
    if (part.type === "tool-result") return text(part.content);
    return "";
  }).join("");
}

function parts(content: ProviderContent): readonly RecordValue[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map(part => {
    if (part.type === "text" || part.type === "reasoning") return { type: "text", text: part.text };
    if (part.type === "image_url" || part.type === "image") {
      const url = part.type === "image" ? part.url : typeof part.imageUrl === "string" ? part.imageUrl : part.imageUrl.url;
      if (!url.startsWith("data:")) throw new TypeError("Anthropic images require base64 data URLs");
      const match = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (match === null) throw new TypeError("Anthropic image data URL is invalid");
      return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
    }
    throw new TypeError(`Anthropic cannot serialize ${part.type} content`);
  });
}

function calls(message: ProviderMessage): readonly RecordValue[] {
  const calls = message.toolCalls ?? (typeof message.content === "string" ? [] : message.content.filter(
    (part): part is Extract<ProviderContentPart, { type: "tool-call" }> => part.type === "tool-call"
  ));
  return calls.map(call => {
    let input: unknown;
    try { input = JSON.parse(call.arguments); } catch { input = {}; }
    return { type: "tool_use", id: call.id, name: call.name, input };
  });
}

function serializeMessage(message: ProviderMessage): RecordValue {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: text(message.content) }]
    };
  }
  const content = [...parts(message.content), ...calls(message)];
  return { role: message.role, content: content.length === 1 && content[0]?.type === "text" ? content[0].text : content };
}

function serializeTool(tool: ProviderTool): RecordValue {
  return {
    name: tool.name,
    ...(tool.description === undefined ? {} : { description: tool.description }),
    input_schema: tool.parameters ?? { type: "object", properties: {} }
  };
}

function requestBody(request: ProviderRequest, stream: boolean): RecordValue {
  const system = request.messages.filter(message => message.role === "system").map(message => text(message.content)).join("\n\n");
  const cachedSystem = request.providerOptions?.anthropic_cache === true;
  const messages = request.messages.filter(message => message.role !== "system").map(serializeMessage);
  const options = request.options;
  return {
    model: request.model,
    messages,
    max_tokens: options?.maxOutputTokens ?? options?.maxTokens ?? 4096,
    stream,
    ...(system.length === 0 ? {} : { system: cachedSystem ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system }),
    ...(request.tools.length === 0 ? {} : { tools: request.tools.map(serializeTool) }),
    ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options?.topP === undefined ? {} : { top_p: options.topP })
  };
}

function usage(value: unknown): ProviderUsageInput {
  const candidate = record(value);
  if (candidate === undefined) return {};
  return {
    ...(typeof candidate.input_tokens === "number" ? { inputTokens: candidate.input_tokens } : {}),
    ...(typeof candidate.output_tokens === "number" ? { outputTokens: candidate.output_tokens } : {}),
    ...(typeof candidate.cache_creation_input_tokens === "number" ? { cacheCreationInputTokens: candidate.cache_creation_input_tokens } : {}),
    ...(typeof candidate.cache_read_input_tokens === "number" ? { cacheReadInputTokens: candidate.cache_read_input_tokens } : {})
  };
}

function parsedResult(value: unknown, request: ProviderRequest): ProviderResult {
  const root = record(value);
  if (root === undefined) throw new ProviderError("Malformed Anthropic response", { category: "invalid_request" });
  const content = root?.content;
  if (!Array.isArray(content)) throw new ProviderError("Malformed Anthropic response", { category: "invalid_request" });
  const calls: { id: string; name: string; arguments: string }[] = [];
  let resultText = "";
  let reasoning = "";
  for (const item of content) {
    const block = record(item);
    if (block?.type === "text" && typeof block.text === "string") resultText += block.text;
    if (block?.type === "thinking" && typeof block.thinking === "string") reasoning += block.thinking;
    if (block?.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
      calls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
    }
  }
  const stopReason = typeof root.stop_reason === "string" ? normalizeProviderFinishReason(root.stop_reason) : "unknown";
  const result: ProviderResult = {
    message: { role: "assistant", content: resultText, ...(reasoning.length === 0 ? {} : { reasoning }), ...(calls.length === 0 ? {} : { toolCalls: calls }) },
    usage: normalizeProviderUsage(usage(root.usage)),
    finishReason: calls.length > 0 ? "tool_call" : stopReason,
    ...(reasoning.length === 0 ? {} : { reasoning }),
    ...(request.identity === undefined ? {} : { identity: request.identity }),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId })
  };
  validateProviderResult(result);
  return result;
}

function endpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/messages`.replace("/v1/v1/", "/v1/");
  return url.toString();
}

async function credentials(options: AnthropicProviderOptions, signal: AbortSignal): Promise<AnthropicCredentials> {
  const resolved = options.credentials ?? await options.resolveCredentialHandle?.(options.credentialHandle as string);
  if (resolved === undefined || resolved.apiKey.trim().length === 0) throw new ProviderError("Anthropic credentials are unavailable", { category: "authentication" });
  if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
  return resolved;
}

function headers(options: AnthropicProviderOptions, credential: AnthropicCredentials): Headers {
  const result = new Headers(options.headers);
  result.set("content-type", "application/json");
  if (options.credentialHeader === "authorization") result.set("authorization", `Bearer ${credential.apiKey}`);
  else result.set("x-api-key", credential.apiKey);
  result.set("anthropic-version", "2023-06-01");
  return result;
}

function requestError(response: Response, body: string): ProviderError {
  const info = normalizeProviderError(new Error(body || `Anthropic request failed with ${response.status}`), { statusCode: response.status });
  return new ProviderError(info.message, { category: info.category, retryable: info.retryable, statusCode: response.status });
}

async function responseBody(response: Response): Promise<string> {
  return await response.text();
}

async function* streamResponse(response: Response, request: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderStreamEvent> {
  if (response.body === null) throw new ProviderError("Anthropic response has no body", { category: "invalid_request" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let toolIds = new Map<number, string>();
  let finished = false;
  const emit = (event: ProviderStreamEvent): ProviderStreamEvent => { validateProviderStreamEvent(event); return event; };
  yield emit({ type: "start", ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
      const next = await reader.read();
      buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data.length === 0) continue;
        const event = record(JSON.parse(data));
        if (event === undefined) continue;
        const type = event.type;
        if (type === "content_block_start") {
          const index = typeof event.index === "number" ? event.index : 0;
          const block = record(event.content_block);
          if (block?.type === "tool_use" && typeof block.id === "string") {
            toolIds.set(index, block.id);
            yield emit({ type: "tool-call-delta", index, id: block.id, ...(typeof block.name === "string" ? { name: block.name } : {}) });
          }
        } else if (type === "content_block_delta") {
          const index = typeof event.index === "number" ? event.index : 0;
          const delta = record(event.delta);
          if (delta?.type === "text_delta" && typeof delta.text === "string") yield emit({ type: "text-delta", text: delta.text });
          if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") yield emit({ type: "reasoning-delta", text: delta.thinking });
          if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") yield emit({ type: "tool-call-delta", index, ...(toolIds.get(index) === undefined ? {} : { id: toolIds.get(index) as string }), arguments: delta.partial_json });
        } else if (type === "message_delta") {
          const delta = record(event.delta);
          const finishReason = normalizeProviderFinishReason(typeof delta?.stop_reason === "string" ? delta.stop_reason : undefined);
          const eventUsage = usage(event.usage);
          if (Object.keys(eventUsage).length > 0) yield emit({ type: "usage", usage: eventUsage });
          finished = true;
          yield emit({ type: "finish", finishReason: finishReason === "unknown" ? "stop" : finishReason, ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
        }
      }
      if (next.done) break;
    }
    if (!finished) yield emit({ type: "finish", finishReason: "stop", ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
  } finally {
    reader.releaseLock();
  }
}

export function createAnthropicProvider(options: AnthropicProviderOptions): ChatProvider {
  const parsedBase = new URL(options.baseUrl);
  if (parsedBase.protocol !== "https:" && parsedBase.hostname !== "localhost" && parsedBase.hostname !== "127.0.0.1") throw new TypeError("baseUrl must use HTTPS");
  const provider: ChatProvider = {
    async complete(request) {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      try {
        const response = await options.fetch(endpoint(options.baseUrl), { method: "POST", headers: headers(options, await credentials(options, context.signal)), body: JSON.stringify(requestBody(request, false)), signal: context.signal });
        const body = await responseBody(response);
        if (!response.ok) throw requestError(response, body);
        return parsedResult(JSON.parse(body) as unknown, request);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(error instanceof Error ? error.message : "Anthropic request failed", { category: context.timedOut() ? "timeout" : context.signal.aborted ? "cancelled" : "network", ...(context.requestId === undefined ? {} : { requestId: context.requestId }) });
      } finally { context.dispose(); }
    },
    async *stream(request) {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      try {
        const response = await options.fetch(endpoint(options.baseUrl), { method: "POST", headers: headers(options, await credentials(options, context.signal)), body: JSON.stringify(requestBody(request, true)), signal: context.signal });
        if (!response.ok) throw requestError(response, await responseBody(response));
        yield* streamResponse(response, request, context.signal);
      } finally { context.dispose(); }
    }
  };
  return provider;
}
