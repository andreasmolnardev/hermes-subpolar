import {
  createProviderRequestContext,
  normalizeProviderError,
  normalizeProviderFinishReason,
  normalizeProviderUsage,
  ProviderError,
  validateProviderRequest,
  validateProviderResult,
  type ChatProvider,
  type ProviderContent,
  type ProviderContentPart,
  type ProviderAudioPart,
  type ProviderFilePart,
  type ProviderImagePart,
  type ProviderImageUrlPart,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResult,
  type ProviderTool,
  type ProviderToolCall,
  type ProviderErrorCategory,
  type ProviderErrorContext,
  type ProviderUsageInput,
  type ProviderMetadata,
  type ProviderJsonValue,
  type ProviderStreamEvent,
  validateProviderStreamEvent
} from "./index";

export type OpenAICompatibleCredentials = {
  readonly apiKey: string;
  readonly organization?: string;
  readonly project?: string;
};

export type OpenAICompatibleFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type OpenAICompatibleProviderOptions = {
  /** Base URL such as https://api.openai.com/v1. */
  readonly baseUrl: string;
  readonly credentials: OpenAICompatibleCredentials;
  readonly fetch: OpenAICompatibleFetch;
  readonly headers?: Readonly<Record<string, string>>;
};

type JsonRecord = { [key: string]: unknown };
type ReadonlyJsonRecord = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(value: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function malformed(path: string, requestId: string | undefined): ProviderError {
  return new ProviderError(`Malformed OpenAI-compatible response at ${path}`, {
    category: "invalid_request",
    ...(requestId === undefined ? {} : { requestId })
  });
}

function requiredString(value: JsonRecord, key: string, path: string, requestId: string | undefined): string {
  if (typeof value[key] !== "string" || value[key].trim().length === 0) throw malformed(`${path}.${key}`, requestId);
  return value[key] as string;
}

function optionalNumber(
  value: JsonRecord,
  key: string,
  path: string,
  requestId: string | undefined
): number | undefined {
  if (!has(value, key)) return undefined;
  if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) {
    throw malformed(`${path}.${key}`, requestId);
  }
  return value[key] as number;
}

function contentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return part.text;
    if (part.type === "tool-result") return contentText(part.content);
    if (part.type === "image" || part.type === "image_url" || part.type === "audio" || part.type === "file") {
      throw new TypeError(`OpenAI-compatible adapter cannot flatten ${part.type} content`);
    }
    return "";
  }).join("");
}

function reasoningText(message: ProviderMessage): string | undefined {
  if (message.reasoning !== undefined) return message.reasoning;
  if (typeof message.content === "string") return undefined;
  const reasoning = message.content
    .filter((part): part is Extract<ProviderContentPart, { type: "reasoning" }> => part.type === "reasoning")
    .map((part) => part.text)
    .join("");
  return reasoning.length === 0 ? undefined : reasoning;
}

function messageToolCalls(message: ProviderMessage): readonly ProviderToolCall[] {
  if (message.toolCalls !== undefined) return message.toolCalls;
  if (typeof message.content === "string") return [];
  return message.content.filter(
    (part): part is Extract<ProviderContentPart, { type: "tool-call" }> => part.type === "tool-call"
  );
}

function serializeToolCall(call: ProviderToolCall): ReadonlyJsonRecord {
  return {
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments }
  };
}

function dataUrl(value: string): { readonly mimeType: string; readonly data: string } {
  const match = /^data:([^;,\s]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (match === null) throw new TypeError("OpenAI-compatible audio content requires a base64 data URL");
  return { mimeType: match[1] as string, data: match[2] as string };
}

function audioFormat(part: ProviderAudioPart): "wav" | "mp3" {
  const source = dataUrl(part.url);
  const mimeType = (part.mimeType ?? source.mimeType).toLowerCase();
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave") return "wav";
  if (mimeType === "audio/mp3" || mimeType === "audio/mpeg") return "mp3";
  throw new TypeError("OpenAI-compatible audio content must be wav or mp3");
}

function serializeImage(part: ProviderImagePart | ProviderImageUrlPart): ReadonlyJsonRecord {
  if (part.type === "image") return { type: "image_url", image_url: { url: part.url } };
  return {
    type: "image_url",
    image_url: typeof part.imageUrl === "string"
      ? { url: part.imageUrl }
      : { url: part.imageUrl.url, ...(part.imageUrl.detail === undefined ? {} : { detail: part.imageUrl.detail }) }
  };
}

function serializeAudio(part: ProviderAudioPart): ReadonlyJsonRecord {
  const source = dataUrl(part.url);
  return {
    type: "input_audio",
    input_audio: { data: source.data, format: audioFormat(part) }
  };
}

function serializeFile(part: ProviderFilePart): ReadonlyJsonRecord {
  return {
    type: "file",
    file: {
      file_data: part.url,
      ...(part.name === undefined ? {} : { filename: part.name })
    }
  };
}

function hasMediaPart(content: readonly ProviderContentPart[]): boolean {
  return content.some((part) => part.type === "image" || part.type === "image_url" ||
    part.type === "audio" || part.type === "file");
}

function serializeContentParts(content: readonly ProviderContentPart[]): readonly ReadonlyJsonRecord[] {
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image" || part.type === "image_url") return serializeImage(part);
    if (part.type === "audio") return serializeAudio(part);
    if (part.type === "file") return serializeFile(part);
    throw new TypeError(`OpenAI-compatible multimodal content cannot contain ${part.type}`);
  });
}

function serializeMessage(message: ProviderMessage): ReadonlyJsonRecord {
  const calls = messageToolCalls(message);
  const media = typeof message.content === "string" ? false : hasMediaPart(message.content);
  if (media && message.role !== "user") {
    throw new TypeError("OpenAI-compatible multimodal content is supported only for user messages");
  }
  const serialized: JsonRecord = {
    role: message.role,
    content: typeof message.content === "string"
      ? message.content
      : media
        ? serializeContentParts(message.content)
        : contentText(message.content)
  };
  if (message.role === "assistant" && calls.length > 0) {
    serialized.content = contentText(message.content) || null;
    serialized.tool_calls = calls.map(serializeToolCall);
  }
  if (message.toolCallId !== undefined) serialized.tool_call_id = message.toolCallId;
  if (message.name !== undefined) serialized.name = message.name;
  const reasoning = reasoningText(message);
  if (reasoning !== undefined) serialized.reasoning_content = reasoning;
  return serialized;
}

function serializeTool(tool: ProviderTool): ReadonlyJsonRecord {
  return {
    type: "function",
    function: {
      name: tool.name,
      ...(tool.description === undefined ? {} : { description: tool.description }),
      ...(tool.parameters === undefined ? {} : { parameters: tool.parameters })
    }
  };
}

function serializeResponseFormat(
  responseFormat: NonNullable<NonNullable<ProviderRequest["options"]>["responseFormat"]>
): ReadonlyJsonRecord {
  if (responseFormat === "text") return { type: "text" };
  if (responseFormat === "json") return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: responseFormat.name,
      schema: responseFormat.schema,
      ...(responseFormat.strict === undefined ? {} : { strict: responseFormat.strict })
    }
  };
}

function serializeRequest(request: ProviderRequest, stream = false): JsonRecord {
  const options = request.options;
  const cacheMetadata = request.cacheHints === undefined ? undefined : {
    ...(request.cacheHints.key === undefined ? {} : { key: request.cacheHints.key }),
    ...(request.cacheHints.ttlMs === undefined ? {} : { ttlMs: request.cacheHints.ttlMs }),
    ...(request.cacheHints.read === undefined ? {} : { read: request.cacheHints.read }),
    ...(request.cacheHints.write === undefined ? {} : { write: request.cacheHints.write })
  };
  return {
    model: request.model,
    messages: request.messages.map(serializeMessage),
    stream,
    ...(request.tools.length === 0 ? {} : { tools: request.tools.map(serializeTool) }),
    ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options?.topP === undefined ? {} : { top_p: options.topP }),
    ...(options?.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(options?.maxOutputTokens === undefined ? {} : { max_completion_tokens: options.maxOutputTokens }),
    ...(options?.stop === undefined ? {} : { stop: options.stop }),
    ...(options?.seed === undefined ? {} : { seed: options.seed }),
    ...(options?.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }),
    ...(options?.responseFormat === undefined ? {} : { response_format: serializeResponseFormat(options.responseFormat) }),
    ...(options?.parallelToolCalls === undefined ? {} : { parallel_tool_calls: options.parallelToolCalls }),
    ...(request.metadata === undefined && cacheMetadata === undefined ? {} : {
      metadata: {
        ...(request.metadata ?? {}),
        ...(cacheMetadata === undefined ? {} : { hermes_cache: cacheMetadata })
      }
    })
  };
}

function streamChunkEvents(
  chunk: unknown,
  requestId: string | undefined,
  identity: ProviderRequest["identity"],
  metadata: ProviderMetadata | undefined,
): ProviderStreamEvent[] {
  if (!isRecord(chunk)) throw malformed("stream chunk", requestId);
  const events: ProviderStreamEvent[] = [];
  const chunkMetadata = responseMetadata(chunk) ?? metadata;
  const choices = chunk.choices;
  if (Array.isArray(choices)) {
    const choice = choices[0];
    if (isRecord(choice)) {
      const delta = isRecord(choice.delta) ? choice.delta : {};
      if (typeof delta.content === "string") events.push({ type: "text-delta", text: delta.content });
      if (typeof delta.reasoning_content === "string") events.push({ type: "reasoning-delta", text: delta.reasoning_content });
      if (Array.isArray(delta.tool_calls)) {
        for (const candidate of delta.tool_calls) {
          if (!isRecord(candidate)) throw malformed("stream tool call", requestId);
          const fn = isRecord(candidate.function) ? candidate.function : {};
          events.push({ type: "tool-call-delta", ...(typeof candidate.id === "string" ? { id: candidate.id } : {}), ...(typeof candidate.index === "number" ? { index: candidate.index } : {}), ...(typeof fn.name === "string" ? { name: fn.name } : {}), ...(typeof fn.arguments === "string" ? { arguments: fn.arguments } : {}) });
        }
      }
      if (typeof choice.finish_reason === "string") events.push({ type: "finish", finishReason: normalizeProviderFinishReason(choice.finish_reason), ...(requestId === undefined ? {} : { requestId }), ...(identity === undefined ? {} : { identity }), ...(chunkMetadata === undefined ? {} : { metadata: chunkMetadata }) });
    }
  }
  if (chunk.usage !== undefined) events.push({ type: "usage", usage: responseUsage(chunk.usage, requestId), ...(chunkMetadata === undefined ? {} : { metadata: chunkMetadata }) });
  return events;
}

async function* streamOpenAIResponse(
  response: Response,
  requestId: string | undefined,
  identity: ProviderRequest["identity"],
  signal: AbortSignal,
): AsyncIterable<ProviderStreamEvent> {
  if (response.body === null) throw malformed("body", requestId);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const emit = (event: ProviderStreamEvent): ProviderStreamEvent => {
    validateProviderStreamEvent(event);
    return event;
  };
  try {
    yield emit({ type: "start", ...(requestId === undefined ? {} : { requestId }), ...(identity === undefined ? {} : { identity }) });
    while (true) {
      if (signal.aborted) throw new ProviderError("OpenAI-compatible request cancelled", { category: "cancelled", ...(requestId === undefined ? {} : { requestId }) });
      const next = await reader.read();
      buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          if (!finished) { finished = true; yield emit({ type: "finish", finishReason: "stop", ...(requestId === undefined ? {} : { requestId }), ...(identity === undefined ? {} : { identity }) }); }
          return;
        }
        const chunk = JSON.parse(data) as unknown;
        for (const event of streamChunkEvents(chunk, requestId, identity, undefined)) {
          if (event.type === "finish") finished = true;
          yield emit(event);
        }
      }
      if (next.done) break;
    }
    if (!finished) yield emit({ type: "finish", finishReason: "stop", ...(requestId === undefined ? {} : { requestId }), ...(identity === undefined ? {} : { identity }) });
  } finally {
    reader.releaseLock();
  }
}

function responseMetadata(value: JsonRecord): ProviderMetadata | undefined {
  const metadata: Record<string, ProviderJsonValue> = {};
  for (const key of ["id", "model", "system_fingerprint", "service_tier"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number" ||
        typeof candidate === "boolean" || candidate === null) {
      metadata[key] = candidate;
    }
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function responseUsage(value: unknown, requestId: string | undefined): ProviderUsageInput {
  if (value === undefined) return {};
  if (!isRecord(value)) throw malformed("usage", requestId);
  const promptDetails = value.prompt_tokens_details;
  const completionDetails = value.completion_tokens_details;
  if (promptDetails !== undefined && !isRecord(promptDetails)) throw malformed("usage.prompt_tokens_details", requestId);
  if (completionDetails !== undefined && !isRecord(completionDetails)) {
    throw malformed("usage.completion_tokens_details", requestId);
  }
  const totalTokens = optionalNumber(value, "total_tokens", "usage", requestId);
  const cachedInputTokens = promptDetails === undefined
    ? undefined
    : optionalNumber(promptDetails, "cached_tokens", "usage.prompt_tokens_details", requestId);
  const reasoningTokens = completionDetails === undefined
    ? undefined
    : optionalNumber(completionDetails, "reasoning_tokens", "usage.completion_tokens_details", requestId);
  const cacheCreationInputTokens = promptDetails === undefined
    ? undefined
    : optionalNumber(promptDetails, "cache_creation_input_tokens", "usage.prompt_tokens_details", requestId);
  const cacheReadInputTokens = promptDetails === undefined
    ? undefined
    : optionalNumber(promptDetails, "cache_read_input_tokens", "usage.prompt_tokens_details", requestId);
  return {
    inputTokens: optionalNumber(value, "prompt_tokens", "usage", requestId) ?? 0,
    outputTokens: optionalNumber(value, "completion_tokens", "usage", requestId) ?? 0,
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(cacheCreationInputTokens === undefined ? {} : { cacheCreationInputTokens }),
    ...(cacheReadInputTokens === undefined ? {} : { cacheReadInputTokens })
  };
}

function responseToolCalls(value: unknown, requestId: string | undefined): ProviderToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw malformed("choices[0].message.tool_calls", requestId);
  return value.map((candidate, index) => {
    const path = `choices[0].message.tool_calls[${index}]`;
    if (!isRecord(candidate)) throw malformed(path, requestId);
    const id = requiredString(candidate, "id", path, requestId);
    const functionValue = candidate.function;
    if (!isRecord(functionValue)) throw malformed(`${path}.function`, requestId);
    return {
      id,
      name: requiredString(functionValue, "name", `${path}.function`, requestId),
      arguments: requiredString(functionValue, "arguments", `${path}.function`, requestId)
    };
  });
}

function parseResponse(
  value: unknown,
  requestId: string | undefined,
  identity: ProviderRequest["identity"]
): ProviderResult {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) {
    throw malformed("choices", requestId);
  }
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) throw malformed("choices[0].message", requestId);
  if (!has(choice, "finish_reason") || (choice.finish_reason !== null && typeof choice.finish_reason !== "string")) {
    throw malformed("choices[0].finish_reason", requestId);
  }
  const message = choice.message;
  if (message.role !== "assistant") throw malformed("choices[0].message.role", requestId);
  if (!has(message, "content") || (message.content !== null && typeof message.content !== "string")) {
    throw malformed("choices[0].message.content", requestId);
  }
  const toolCalls = responseToolCalls(message.tool_calls, requestId);
  const reasoning = message.reasoning_content;
  if (reasoning !== undefined && typeof reasoning !== "string") {
    throw malformed("choices[0].message.reasoning_content", requestId);
  }
  const content: ProviderContent = message.content === null ? [] : message.content;
  const metadata = responseMetadata(value);
  const result: ProviderResult = {
    message: {
      role: "assistant",
      content,
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(toolCalls.length === 0 ? {} : { toolCalls })
    },
    usage: normalizeProviderUsage(responseUsage(value.usage, requestId)),
    finishReason: normalizeProviderFinishReason(choice.finish_reason === null ? undefined : choice.finish_reason),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(identity === undefined ? {} : { identity }),
    ...(metadata === undefined ? {} : { metadata })
  };
  validateProviderResult(result);
  return result;
}

function requestError(message: string, category: ProviderErrorCategory, requestId: string | undefined, statusCode?: number): ProviderError {
  return new ProviderError(message, {
    category,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(requestId === undefined ? {} : { requestId })
  });
}

function classifiedRequestError(
  message: string,
  error: unknown,
  context: ProviderErrorContext
): ProviderError {
  const info = normalizeProviderError(error, context);
  return new ProviderError(message, {
    category: info.category,
    retryable: info.retryable,
    ...(info.statusCode === undefined ? {} : { statusCode: info.statusCode }),
    ...(info.requestId === undefined ? {} : { requestId: info.requestId }),
    ...(info.metadata === undefined ? {} : { metadata: info.metadata })
  });
}

function requestIdFromResponse(response: Response, requestId: string | undefined): string | undefined {
  if (requestId !== undefined) return requestId;
  const candidate = response.headers.get("x-request-id")?.trim();
  return candidate === undefined || candidate.length === 0 ? undefined : candidate;
}

function abortRequestError(context: ReturnType<typeof createProviderRequestContext>): ProviderError {
  return requestError(
    context.timedOut() ? "OpenAI-compatible request timed out" : "OpenAI-compatible request cancelled",
    context.timedOut() ? "timeout" : "cancelled",
    context.requestId
  );
}

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

/** Credential-injected, non-streaming adapter for OpenAI-compatible chat APIs. */
export function createOpenAICompatibleProvider(options: OpenAICompatibleProviderOptions): ChatProvider {
  if (options.baseUrl.trim().length === 0) throw new TypeError("baseUrl must be non-empty");
  if (options.credentials.apiKey.trim().length === 0) throw new TypeError("credentials.apiKey must be non-empty");

  return {
    async complete(request: ProviderRequest): Promise<ProviderResult> {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      const requestId = context.requestId;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${options.credentials.apiKey}`,
        ...options.headers
      };
      if (options.credentials.organization !== undefined) headers["OpenAI-Organization"] = options.credentials.organization;
      if (options.credentials.project !== undefined) headers["OpenAI-Project"] = options.credentials.project;
      if (requestId !== undefined) headers["X-Request-ID"] = requestId;

      let body: string;
      try {
        body = JSON.stringify(serializeRequest(request));
      } catch (error) {
        throw requestError(
          "Invalid OpenAI-compatible request content",
          "invalid_request",
          requestId
        );
      }

      try {
        if (context.signal.aborted) throw abortRequestError(context);
        let response: Response;
        try {
          response = await options.fetch(endpointFor(options.baseUrl), {
            method: "POST",
            headers,
            body,
            signal: context.signal
          });
        } catch (error) {
          if (context.signal.aborted) {
            throw abortRequestError(context);
          }
          throw classifiedRequestError(
            "OpenAI-compatible network request failed",
            error,
            { ...(requestId === undefined ? {} : { requestId }), network: true }
          );
        }

        if (!response.ok) {
          const responseId = requestIdFromResponse(response, requestId);
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            body = undefined;
          }
          throw classifiedRequestError(
            `OpenAI-compatible request failed with status ${response.status}`,
            new Error("OpenAI-compatible provider request failed"),
            {
              ...(responseId === undefined ? {} : { requestId: responseId }),
              statusCode: response.status,
              body
            }
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (context.signal.aborted) throw abortRequestError(context);
          throw malformed("body", requestId);
        }
        const responseId = requestIdFromResponse(response, requestId);
        return parseResponse(payload, responseId, request.identity);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (context.signal.aborted) {
          throw abortRequestError(context);
        }
        throw classifiedRequestError(
          "OpenAI-compatible request failed",
          error,
          { ...(requestId === undefined ? {} : { requestId }) }
        );
      } finally {
        context.dispose();
      }
    },
    stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      validateProviderRequest(request);
      const context = createProviderRequestContext(request);
      const requestId = context.requestId;
      return (async function* (): AsyncIterable<ProviderStreamEvent> {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          authorization: `Bearer ${options.credentials.apiKey}`,
          ...options.headers,
        };
        if (options.credentials.organization !== undefined) headers["OpenAI-Organization"] = options.credentials.organization;
        if (options.credentials.project !== undefined) headers["OpenAI-Project"] = options.credentials.project;
        if (requestId !== undefined) headers["X-Request-ID"] = requestId;
        try {
          if (context.signal.aborted) throw abortRequestError(context);
          const response = await options.fetch(endpointFor(options.baseUrl), {
            method: "POST",
            headers,
            body: JSON.stringify(serializeRequest(request, true)),
            signal: context.signal,
          });
          if (!response.ok) {
            const responseId = requestIdFromResponse(response, requestId);
            throw classifiedRequestError(
              `OpenAI-compatible request failed with status ${response.status}`,
              new Error("OpenAI-compatible provider request failed"),
              { ...(responseId === undefined ? {} : { requestId: responseId }), statusCode: response.status },
            );
          }
          yield* streamOpenAIResponse(response, requestIdFromResponse(response, requestId), request.identity, context.signal);
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          if (context.signal.aborted) throw abortRequestError(context);
          throw classifiedRequestError("OpenAI-compatible streaming request failed", error, { ...(requestId === undefined ? {} : { requestId }) });
        } finally {
          context.dispose();
        }
      })();
    }
  };
}
