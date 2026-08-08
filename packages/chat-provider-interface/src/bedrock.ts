import {
  normalizeProviderError,
  normalizeProviderUsage,
  ProviderError,
  validateProviderRequest,
  validateProviderResult,
  type ChatProvider,
  type ProviderContent,
  type ProviderMessage,
  type ProviderRequest,
  type ProviderResult,
  type ProviderTool
} from "./index";

export type BedrockCredentials = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly region: string;
};

export type BedrockSignedRequest = {
  readonly url: string;
  readonly method: "POST";
  readonly body: string;
  readonly headers: Headers;
  readonly credentials: BedrockCredentials;
};

export type BedrockProviderOptions = {
  readonly baseUrl: string;
  readonly credentials?: BedrockCredentials;
  readonly credentialHandle?: string;
  readonly resolveCredentialHandle?: (handle: string) => BedrockCredentials | Promise<BedrockCredentials>;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly signRequest: (request: BedrockSignedRequest) => Headers | Promise<Headers>;
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined; }
function text(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map(part => part.type === "text" || part.type === "reasoning" ? part.text : part.type === "tool-result" ? text(part.content) : "").join("");
}
function message(message: ProviderMessage): RecordValue {
  if (message.role === "tool") return { role: "user", content: [{ toolResult: { toolUseId: message.toolCallId, content: [{ text: text(message.content) }] } }] };
  const calls = message.toolCalls ?? [];
  return {
    role: message.role === "system" ? "user" : message.role,
    content: [
      ...(text(message.content).length === 0 ? [] : [{ text: text(message.content) }]),
      ...calls.map(call => ({ toolUse: { toolUseId: call.id, name: call.name, input: (() => { try { return JSON.parse(call.arguments); } catch { return {}; } })() } }))
    ]
  };
}
function tool(tool: ProviderTool): RecordValue {
  return { toolSpec: { name: tool.name, ...(tool.description === undefined ? {} : { description: tool.description }), inputSchema: { json: tool.parameters ?? { type: "object", properties: {} } } } };
}
function requestBody(request: ProviderRequest): RecordValue {
  const options = request.options;
  return {
    messages: request.messages.filter(message => message.role !== "system").map(message),
    ...(request.messages.some(message => message.role === "system") ? { system: request.messages.filter(message => message.role === "system").map(message => ({ text: text(message.content) })) } : {}),
    ...(request.tools.length === 0 ? {} : { toolConfig: { tools: request.tools.map(tool) } }),
    inferenceConfig: {
      ...(options?.maxOutputTokens === undefined && options?.maxTokens === undefined ? {} : { maxTokens: options.maxOutputTokens ?? options.maxTokens }),
      ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options?.topP === undefined ? {} : { topP: options.topP }),
      ...(options?.stop === undefined ? {} : { stopSequences: typeof options.stop === "string" ? [options.stop] : options.stop })
    }
  };
}
function endpoint(baseUrl: string, model: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/model/${encodeURIComponent(model)}/converse`;
  return url.toString();
}
function parsed(value: unknown, request: ProviderRequest): ProviderResult {
  const root = record(value);
  const output = record(root?.output);
  const responseMessage = record(output?.message);
  const content = Array.isArray(responseMessage?.content) ? responseMessage.content : [];
  let responseText = "";
  const calls: { id: string; name: string; arguments: string }[] = [];
  for (const candidate of content) {
    const item = record(candidate);
    if (typeof item?.text === "string") responseText += item.text;
    const call = record(item?.toolUse);
    if (typeof call?.toolUseId === "string" && typeof call.name === "string") calls.push({ id: call.toolUseId, name: call.name, arguments: JSON.stringify(call.input ?? {}) });
  }
  const stopReason = typeof root?.stopReason === "string" ? root.stopReason : "end_turn";
  const usageValue = record(root?.usage);
  const result: ProviderResult = {
    message: { role: "assistant", content: responseText, ...(calls.length === 0 ? {} : { toolCalls: calls }) },
    usage: normalizeProviderUsage({ inputTokens: typeof usageValue?.inputTokens === "number" ? usageValue.inputTokens : 0, outputTokens: typeof usageValue?.outputTokens === "number" ? usageValue.outputTokens : 0 }),
    finishReason: calls.length > 0 ? "tool_call" : stopReason === "max_tokens" ? "length" : "stop",
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    ...(request.identity === undefined ? {} : { identity: request.identity })
  };
  validateProviderResult(result);
  return result;
}

export function createBedrockConverseProvider(options: BedrockProviderOptions): ChatProvider {
  if (new URL(options.baseUrl).protocol !== "https:") throw new TypeError("Bedrock baseUrl must use HTTPS");
  return {
    async complete(request) {
      validateProviderRequest(request);
      const credentials = options.credentials ?? await options.resolveCredentialHandle?.(options.credentialHandle as string);
      if (credentials === undefined) throw new ProviderError("Bedrock credentials are unavailable", { category: "authentication" });
      const body = JSON.stringify(requestBody(request));
      const signed = await options.signRequest({ url: endpoint(options.baseUrl, request.model), method: "POST", body, headers: new Headers({ "content-type": "application/json" }), credentials });
      const signal = request.signal ?? request.cancellation;
      const response = await options.fetch(endpoint(options.baseUrl, request.model), { method: "POST", headers: signed, body, ...(signal === undefined ? {} : { signal }) });
      if (!response.ok) {
        const info = normalizeProviderError(new Error(await response.text()), { statusCode: response.status, ...(request.requestId === undefined ? {} : { requestId: request.requestId }) });
        throw new ProviderError(info.message, { category: info.category, retryable: info.retryable, statusCode: response.status, ...(request.requestId === undefined ? {} : { requestId: request.requestId }) });
      }
      return parsed(await response.json() as unknown, request);
    }
  };
}
