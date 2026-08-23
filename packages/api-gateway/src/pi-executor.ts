import type {
  ChatProvider,
  ProviderContent,
  ProviderJsonObject,
  ProviderMessage,
  ProviderResult,
} from "chat-provider-interface";
import {
  createSubpolarPiProviderBridge,
  executeSubpolarPiRun,
  piAssistantMessageToProviderResult,
  toSubpolarPiTool,
  type HarnessApprovalRequest,
  type HarnessAtomicTurnWrite,
  type HarnessPersistedMessageDraft,
  type HarnessPersistedUsage,
  type HarnessRecoveredToolCall,
  type HarnessResult,
  type HarnessSessionSetup,
  type HarnessTool,
  type HarnessToolResult,
  type SubpolarPiModelResolution,
  type SubpolarPiEvent,
  type SubpolarPiRunContext,
} from "harness";
import type { ToolDescriptor } from "tool-resolver";
import type {
  GatewayEventProjectionInput,
  GatewayProjectionBase,
} from "./client";
import type { GatewayNormalizedRequest, GatewayPiExecutor } from "./index";

export type GatewayPiExecutorOptions = {
  /** Server-controlled directory used when a request has no project workspace. */
  readonly cwd: string;
  /** Server-controlled Pi resource directory; never derived from the request. */
  readonly agentDir: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly systemPrompt?: (request: GatewayNormalizedRequest) => string | undefined;
  /** Optional native Pi model resolution. When present, the compatibility ChatProvider is not used for model calls. */
  readonly resolveModel?: (request: GatewayNormalizedRequest) => Promise<SubpolarPiModelResolution>;
};

function isToolDescriptor(value: GatewayNormalizedRequest["tools"][number]): value is ToolDescriptor {
  return "inputSchema" in value;
}

function contentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map(part => {
    if (part.type === "text" || part.type === "reasoning") return part.text;
    return JSON.stringify(part);
  }).join("\n");
}

function objectArguments(value: unknown): ProviderJsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as ProviderJsonObject;
}

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "[unserializable tool result]";
  }
}

function toolResult(value: { readonly content?: unknown; readonly isError?: boolean }): { content: [{ type: "text"; text: string }]; details: Record<string, never>; isError?: true } {
  return {
    content: [{ type: "text", text: resultText(value.content) }],
    details: {},
    ...(value.isError === true ? { isError: true as const } : {}),
  };
}

function harnessToolResult(value: { readonly content?: unknown; readonly isError?: boolean }): HarnessToolResult {
  return {
    content: typeof value.content === "string" ? value.content : resultText(value.content),
    ...(value.isError === true ? { isError: true } : {}),
  };
}

function persistedAssistant(request: GatewayNormalizedRequest, result: ProviderResult, recordedAt: string): HarnessPersistedMessageDraft {
  const finishReason = result.finishReason === undefined || result.finishReason === "unknown"
    ? undefined
    : result.finishReason === "tool_call"
      ? "tool_calls" as const
      : result.finishReason === "cancelled"
        ? "error" as const
        : result.finishReason;
  return {
    id: `${request.requestId}:assistant`,
    role: "assistant",
    content: result.message.content as HarnessPersistedMessageDraft["content"],
    createdAt: recordedAt,
    ...(result.message.reasoning === undefined ? {} : { reasoning: result.message.reasoning }),
    ...(result.message.toolCalls === undefined ? {} : { toolCalls: result.message.toolCalls }),
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(result.usage === undefined ? {} : { usage: result.usage }),
  };
}

async function checkpointPiTool(
  request: GatewayNormalizedRequest,
  call: { readonly id: string; readonly name: string; readonly arguments: string },
  phase: "before-tool" | "tool-completed",
  result: HarnessToolResult | undefined,
): Promise<void> {
  if (request.persistence?.checkpoint === undefined) return;
  const completedToolCalls: readonly HarnessRecoveredToolCall[] = result === undefined ? [] : [{ call, result }];
  await request.persistence.checkpoint({
    requestId: request.requestId,
    sessionId: request.sessionId,
    turnId: request.requestId,
    call,
    phase,
    pendingToolCallIds: phase === "before-tool" ? [call.id] : [],
    completedToolCalls,
    ...(result === undefined ? {} : { result }),
    at: new Date().toISOString(),
  });
}

async function persistPiResult(request: GatewayNormalizedRequest, result: ProviderResult): Promise<void> {
  const repository = request.persistence ?? request.sessionRepository;
  if (repository?.commitTurn === undefined) return;
  const recordedAt = new Date().toISOString();
  const existing = repository.listMessages === undefined ? undefined : await repository.listMessages(request.sessionId);
  const usage: HarnessPersistedUsage = {
    schemaVersion: 1,
    sessionId: request.sessionId,
    recordedAt,
    usage: result.usage,
    messageId: `${request.requestId}:assistant`,
  };
  const write: HarnessAtomicTurnWrite = {
    sessionId: request.sessionId,
    messages: [persistedAssistant(request, result, recordedAt)],
    ...(existing === undefined ? {} : { expectedNextSequence: existing.length }),
    usage,
  };
  if (repository.transaction !== undefined) {
    await repository.transaction(transaction => transaction.commitTurn(write));
  } else {
    await repository.commitTurn(write);
  }
}

function gatewayBase(request: GatewayNormalizedRequest, id: string): GatewayProjectionBase {
  return { id, requestId: request.requestId, sessionId: request.sessionId, at: Date.now() };
}

function projectPiEvent(request: GatewayNormalizedRequest, event: SubpolarPiEvent, sink: (event: GatewayEventProjectionInput) => void | Promise<void>, nextId: () => string): Promise<void> {
  const base = gatewayBase(request, nextId());
  switch (event.type) {
    case "run.started":
      return Promise.resolve(sink({ ...base, type: "request.started" }));
    case "assistant.text_delta":
      return Promise.resolve(sink({ ...base, type: "message.delta", text: event.delta }));
    case "assistant.thinking_delta":
      return Promise.resolve(sink({ ...base, type: "reasoning.delta", text: event.delta }));
    case "tool.started":
      return Promise.resolve(sink({ ...base, type: "tool.called", call: { id: event.toolCallId, name: event.toolName, arguments: JSON.stringify(event.args) } }));
    case "tool.completed":
      return Promise.resolve(sink({ ...base, type: "tool.completed", callId: event.toolCallId, result: toolResult({ content: event.result, isError: event.isError }) }));
    case "run.completed":
      return Promise.resolve(sink({ ...base, type: "terminal", outcome: "completed" }));
    default:
      return Promise.resolve();
  }
}

function toolForApproval(descriptor: ToolDescriptor): HarnessTool {
  return {
    name: descriptor.name,
    policy: descriptor.policy,
    description: descriptor.description,
    parameters: descriptor.inputSchema as ProviderJsonObject,
  };
}

function requestUserMessage(messages: readonly ProviderMessage[]): { history: readonly ProviderMessage[]; userMessage: string } {
  const lastUser = [...messages].map((message, index) => ({ message, index })).reverse().find(entry => entry.message.role === "user");
  if (lastUser === undefined) throw new TypeError("Pi execution requires a user message");
  return {
    history: messages.slice(0, lastUser.index),
    userMessage: contentText(lastUser.message.content),
  };
}

/** Build the opt-in Pi execution path while leaving gateway persistence policy outside Pi. */
export function createGatewayPiExecutor(options: GatewayPiExecutorOptions): GatewayPiExecutor {
  let eventSequence = 0;
  return async (request, provider, eventSink): Promise<HarnessResult> => {
    const run: SubpolarPiRunContext = {
      runId: request.requestId,
      conversationId: request.sessionId,
      sessionId: request.sessionId,
      cwd: request.cwd ?? options.cwd,
      agentDir: options.agentDir,
    };
    const signal = request.signal ?? new AbortController().signal;
    const sessionSetup: HarnessSessionSetup = {
      sessionId: request.sessionId,
      model: request.model,
      runtime: { runtimeVersion: "pi", schemaVersion: 1 },
      createdAt: new Date().toISOString(),
    };
    await request.persistence?.ensureSession?.(request.sessionId, sessionSetup);
    await request.sessionRepository?.ensureSession?.(request.sessionId, sessionSetup);
    const inboundPreparer = request.persistence as (typeof request.persistence & {
      prepareInbound?: (sessionId: string, requestId: string, model: string, messages: readonly ProviderMessage[]) => Promise<void>;
    }) | undefined;
    await inboundPreparer?.prepareInbound?.(request.sessionId, request.requestId, request.model, request.messages);
    const descriptors = request.tools.filter(isToolDescriptor);
    const tools = descriptors.map(descriptor => toSubpolarPiTool(
      descriptor,
      run,
      async (_descriptor, toolRequest) => {
        const argumentsValue = objectArguments(toolRequest.params);
        if (request.toolExecutor !== undefined) {
          const call = { id: toolRequest.toolCallId, name: descriptor.name, arguments: JSON.stringify(argumentsValue) };
          await checkpointPiTool(request, call, "before-tool", undefined);
          const result = await request.toolExecutor({
            requestId: request.requestId,
            sessionId: request.sessionId,
            call,
            arguments: argumentsValue,
            signal,
          });
          const persisted = harnessToolResult(result);
          await checkpointPiTool(request, call, "tool-completed", persisted);
          return toolResult(persisted);
        }
        if ("handle" in descriptor.executable && descriptor.executable.handle !== undefined) {
          const call = { id: toolRequest.toolCallId, name: descriptor.name, arguments: JSON.stringify(argumentsValue) };
          await checkpointPiTool(request, call, "before-tool", undefined);
          const value = await descriptor.executable.handle.execute(argumentsValue, signal);
          const persisted = harnessToolResult({ content: value });
          await checkpointPiTool(request, call, "tool-completed", persisted);
          return toolResult(persisted);
        }
        return toolResult({ content: `No executable handle for tool ${descriptor.name}`, isError: true });
      },
      request.approvalPolicy === undefined ? undefined : async approval => {
        const approvalRequest: HarnessApprovalRequest = {
          requestId: request.requestId,
          sessionId: request.sessionId,
          tool: toolForApproval(descriptor),
          call: { id: approval.toolCallId, name: descriptor.name, arguments: JSON.stringify(objectArguments(approval.params)) },
          arguments: objectArguments(approval.params),
          signal,
        };
        return request.approvalPolicy!(approvalRequest);
      },
    ));
    const assembled = request.contextAssembler === undefined
      ? request.messages
      : await request.contextAssembler({
        requestId: request.requestId,
        sessionId: request.sessionId,
        model: request.model,
        messages: request.messages as never,
        tools: descriptors.map(toolForApproval),
        signal,
      });
    const systemPrompt = [
      options.systemPrompt?.(request),
      ...assembled.filter(message => message.role === "system").map(message => contentText(message.content as ProviderContent)),
    ].filter((value): value is string => value !== undefined && value.trim() !== "").join("\n\n");
    const assembledUser = requestUserMessage(assembled as readonly ProviderMessage[]);
    const nativeResolution = options.resolveModel === undefined ? undefined : await options.resolveModel(request);
    const bridge = nativeResolution === undefined ? createSubpolarPiProviderBridge({
      providerId: options.providerId ?? "subpolar",
      ...(options.providerName === undefined ? {} : { providerName: options.providerName }),
      modelId: request.model,
      chatProvider: provider,
    }) : undefined;
    const result = await executeSubpolarPiRun({
      ...run,
      model: nativeResolution?.model ?? bridge!.model,
      ...(nativeResolution === undefined ? { nativeProviders: [bridge!.provider] } : { modelRuntime: nativeResolution.modelRuntime }),
      tools,
      systemPrompt: systemPrompt || undefined,
      history: assembledUser.history,
      userMessage: assembledUser.userMessage,
      signal,
      onEvent: event => {
        if (eventSink !== undefined) void projectPiEvent(request, event, eventSink, () => `pi-${++eventSequence}`);
      },
    });
    const providerResult = piAssistantMessageToProviderResult(result.message?.role === "assistant" ? result.message : undefined);
    await persistPiResult(request, providerResult);
    return providerResult;
  };
}
