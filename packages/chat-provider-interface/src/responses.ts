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
  type ProviderTool
} from "./index";

export type ResponsesCredentials = { readonly apiKey: string };
export type ResponsesProviderOptions = {
  readonly baseUrl: string;
  readonly credentials?: ResponsesCredentials;
  readonly credentialHandle?: string;
  readonly resolveCredentialHandle?: (handle: string) => ResponsesCredentials | Promise<ResponsesCredentials>;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly credentialHeader?: "authorization" | "x-api-key";
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined; }
function contentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map(part => part.type === "text" || part.type === "reasoning" ? part.text : part.type === "tool-result" ? contentText(part.content) : "").join("");
}
function inputContent(content: ProviderContent): readonly RecordValue[] {
  if (typeof content === "string") return [{ type: "input_text", text: content }];
  return content.flatMap((part): readonly RecordValue[] => {
    if (part.type === "text" || part.type === "reasoning") return [{ type: "input_text", text: part.text }];
    if (part.type === "image" || part.type === "image_url") return [{ type: "input_image", image_url: part.type === "image" ? part.url : typeof part.imageUrl === "string" ? part.imageUrl : part.imageUrl.url }];
    return [];
  });
}
function inputMessage(message: ProviderMessage): RecordValue {
  return { role: message.role === "tool" ? "user" : message.role, content: inputContent(message.content) };
}
function tool(tool: ProviderTool): RecordValue {
  return { type: "function", name: tool.name, ...(tool.description === undefined ? {} : { description: tool.description }), parameters: tool.parameters ?? { type: "object", properties: {} }, strict: true };
}
function body(request: ProviderRequest, stream: boolean): RecordValue {
  const options = request.options;
  return {
    ...(request.providerOptions ?? {}),
    model: request.model,
    input: request.messages.map(inputMessage),
    stream,
    ...(request.tools.length === 0 ? {} : { tools: request.tools.map(tool) }),
    ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options?.topP === undefined ? {} : { top_p: options.topP }),
    ...(options?.maxOutputTokens === undefined && options?.maxTokens === undefined ? {} : { max_output_tokens: options.maxOutputTokens ?? options.maxTokens }),
    ...(options?.reasoningEffort === undefined ? {} : { reasoning: { effort: options.reasoningEffort } })
  };
}
function endpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/responses`.replace("/v1/v1/", "/v1/");
  return url.toString();
}
function responseError(response: Response, message: string): ProviderError {
  const info = normalizeProviderError(new Error(message), { statusCode: response.status });
  return new ProviderError(info.message, { category: info.category, retryable: info.retryable, statusCode: response.status });
}
function parsed(value: unknown, request: ProviderRequest): ProviderResult {
  const root = record(value);
  const output = Array.isArray(root?.output) ? root.output : [];
  let text = "";
  const calls: { id: string; name: string; arguments: string }[] = [];
  for (const candidate of output) {
    const item = record(candidate);
    if (item?.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string" && typeof item.arguments === "string") calls.push({ id: item.call_id, name: item.name, arguments: item.arguments });
    if (item?.type === "message" && Array.isArray(item.content)) for (const part of item.content) {
      const contentPart = record(part);
      if (contentPart?.type === "output_text" && typeof contentPart.text === "string") text += contentPart.text;
    }
  }
  const rawUsage = record(root?.usage);
  const result: ProviderResult = {
    message: { role: "assistant", content: text, ...(calls.length === 0 ? {} : { toolCalls: calls }) },
    usage: normalizeProviderUsage({ inputTokens: typeof rawUsage?.input_tokens === "number" ? rawUsage.input_tokens : 0, outputTokens: typeof rawUsage?.output_tokens === "number" ? rawUsage.output_tokens : 0 }),
    finishReason: calls.length > 0 ? "tool_call" : root?.status === "completed" ? "stop" : normalizeProviderFinishReason(typeof root?.status === "string" ? root.status : "stop"),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    ...(request.identity === undefined ? {} : { identity: request.identity })
  };
  validateProviderResult(result);
  return result;
}
async function* streamResponse(response: Response, request: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderStreamEvent> {
  if (response.body === null) throw new ProviderError("Responses response has no body", { category: "invalid_request" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const emit = (event: ProviderStreamEvent): ProviderStreamEvent => { validateProviderStreamEvent(event); return event; };
  yield emit({ type: "start", ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
      const next = await reader.read();
      buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
        const event = record(JSON.parse(raw)); if (event === undefined) continue;
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") yield emit({ type: "text-delta", text: event.delta });
        if (event.type === "response.function_call_arguments.delta" && typeof event.delta === "string") yield emit({ type: "tool-call-delta", ...(typeof event.item_id === "string" ? { id: event.item_id } : {}), arguments: event.delta });
        if (event.type === "response.completed") {
          const responseValue = record(event.response);
          const usageValue = record(responseValue?.usage);
          if (usageValue !== undefined) yield emit({ type: "usage", usage: { inputTokens: typeof usageValue.input_tokens === "number" ? usageValue.input_tokens : 0, outputTokens: typeof usageValue.output_tokens === "number" ? usageValue.output_tokens : 0 } });
          finished = true;
          yield emit({ type: "finish", finishReason: "stop", ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
        }
      }
      if (next.done) break;
    }
    if (!finished) yield emit({ type: "finish", finishReason: "stop", ...(request.requestId === undefined ? {} : { requestId: request.requestId }), ...(request.identity === undefined ? {} : { identity: request.identity }) });
  } finally { reader.releaseLock(); }
}

export function createResponsesProvider(options: ResponsesProviderOptions): ChatProvider {
  const provider: ChatProvider = {
    async complete(request) {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      try {
        const credential = options.credentials ?? await options.resolveCredentialHandle?.(options.credentialHandle as string);
        if (credential === undefined || credential.apiKey.trim().length === 0) throw new ProviderError("Responses credentials are unavailable", { category: "authentication" });
        const headers = new Headers(options.headers); headers.set("content-type", "application/json"); if (options.credentialHeader === "x-api-key") headers.set("x-api-key", credential.apiKey); else headers.set("authorization", `Bearer ${credential.apiKey}`);
        const response = await options.fetch(endpoint(options.baseUrl), { method: "POST", headers, body: JSON.stringify(body(request, false)), signal: context.signal });
        if (!response.ok) throw responseError(response, await response.text());
        return parsed(await response.json() as unknown, request);
      } finally { context.dispose(); }
    },
    async *stream(request) {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      try {
        const credential = options.credentials ?? await options.resolveCredentialHandle?.(options.credentialHandle as string);
        if (credential === undefined || credential.apiKey.trim().length === 0) throw new ProviderError("Responses credentials are unavailable", { category: "authentication" });
        const headers = new Headers(options.headers); headers.set("content-type", "application/json"); if (options.credentialHeader === "x-api-key") headers.set("x-api-key", credential.apiKey); else headers.set("authorization", `Bearer ${credential.apiKey}`);
        const response = await options.fetch(endpoint(options.baseUrl), { method: "POST", headers, body: JSON.stringify(body(request, true)), signal: context.signal });
        if (!response.ok) throw responseError(response, await response.text());
        yield* streamResponse(response, request, context.signal);
      } finally { context.dispose(); }
    }
  };
  return provider;
}
