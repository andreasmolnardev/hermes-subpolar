import { randomUUID } from "node:crypto";
import type { CredentialStore, Model, Provider } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ProviderMessage } from "chat-provider-interface";
import type {
	HarnessPersistencePort,
	HarnessSessionSetup,
	HarnessToolCall,
	HarnessToolResult,
} from "./index";
import { executeSubpolarPiRun, type SubpolarPiRunResult } from "./pi-runtime";
import type { SubpolarPiEvent, SubpolarPiEventSink } from "./pi-events";
import type { SubpolarPiRunContext, SubpolarPiTool, SubpolarPiToolResult } from "./pi-tools";

/** Immutable identity inherited by a Subpolar-controlled child run. */
export type SubpolarPiParentRunContext = Readonly<SubpolarPiRunContext>;

export interface SubpolarPiChildSessionOptions {
	readonly parent: SubpolarPiParentRunContext;
	readonly childAgentId: string;
	readonly childRunId?: string;
	readonly model: Model<any>;
	readonly instructions: string;
	readonly cwd: string;
	/** The complete, already-authorized capability set for this child. */
	readonly tools: readonly SubpolarPiTool[];
	readonly signal?: AbortSignal;
	readonly history?: readonly ProviderMessage[];
	readonly modelRuntime?: ModelRuntime;
	readonly credentials?: CredentialStore;
	readonly nativeProviders?: readonly Provider[];
	/** Existing application persistence adapter used for child session metadata and tool recovery. */
	readonly persistence?: HarnessPersistencePort;
	readonly onEvent?: SubpolarPiChildEventSink;
}

export type SubpolarPiChildEvent = SubpolarPiEvent & {
	readonly parentRunId: string;
	readonly childRunId: string;
};

export type SubpolarPiChildEventSink = (event: SubpolarPiChildEvent) => void;

export interface SubpolarPiChildRunResult {
	readonly parentRunId: string;
	readonly childRunId: string;
	readonly childAgentId: string;
	readonly message: SubpolarPiRunResult["message"];
	readonly events: readonly SubpolarPiChildEvent[];
}

function childId(parentRunId: string): string {
	return `${parentRunId}:child:${randomUUID()}`;
}

function childSessionId(parentSessionId: string, childRunId: string): string {
	const normalized = `${parentSessionId}.${childRunId}`.replace(/[^A-Za-z0-9._-]/g, "_");
	return normalized.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || "child-session";
}

function correlate(event: SubpolarPiEvent, parentRunId: string, childRunId: string): SubpolarPiChildEvent {
	return { ...event, parentRunId, childRunId };
}

function serializeForCheckpoint(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "[unserializable child tool value]";
	}
}

function checkpointResult(result: SubpolarPiToolResult): HarnessToolResult {
	return {
		content: serializeForCheckpoint(result.content),
		...(result.isError === undefined ? {} : { isError: result.isError }),
	};
}

function checkpointCall(tool: SubpolarPiTool, request: Parameters<SubpolarPiTool["execute"]>[0]): HarnessToolCall {
	return {
		id: request.toolCallId,
		name: tool.name,
		arguments: serializeForCheckpoint(request.params),
	};
}

function persistentChildTools(
	tools: readonly SubpolarPiTool[],
	childContext: SubpolarPiRunContext,
	persistence: HarnessPersistencePort | undefined,
): readonly SubpolarPiTool[] {
	if (persistence?.checkpoint === undefined) return tools;
	return tools.map(tool => ({
		...tool,
		execute: async (request) => {
			const call = checkpointCall(tool, request);
			const at = (): string => new Date().toISOString();
			await persistence.checkpoint!({
				requestId: childContext.runId,
				sessionId: childContext.sessionId,
				turnId: childContext.runId,
				call,
				phase: "before-tool",
				pendingToolCallIds: [call.id],
				completedToolCalls: [],
				at: at(),
			});
			const result = await tool.execute(request);
			await persistence.checkpoint!({
				requestId: childContext.runId,
				sessionId: childContext.sessionId,
				turnId: childContext.runId,
				call,
				phase: "tool-completed",
				pendingToolCallIds: [],
				completedToolCalls: [{ call, result: checkpointResult(result) }],
				result: checkpointResult(result),
				at: at(),
			});
			return result;
		},
	}));
}

/**
 * Execute one bounded child Pi session under the parent run's Subpolar
 * identity. The child receives only the caller-provided tools and delegates
 * the actual session lifecycle to the same application-owned Pi runner as a
 * top-level run.
 */
export async function executeSubpolarPiChildRun(
	options: SubpolarPiChildSessionOptions,
): Promise<SubpolarPiChildRunResult> {
	if (options.childAgentId.trim() === "") throw new Error("A child agent id is required.");
	if (options.instructions.trim() === "") throw new Error("Child agent instructions are required.");
	const parentRunId = options.parent.runId;
	const childRunId = options.childRunId ?? childId(parentRunId);
	const childContext: SubpolarPiRunContext = Object.freeze({
		runId: childRunId,
		conversationId: options.parent.conversationId,
		sessionId: childSessionId(options.parent.sessionId, childRunId),
		cwd: options.cwd,
		agentDir: options.parent.agentDir,
	});
	const sessionSetup: HarnessSessionSetup = {
		sessionId: childContext.sessionId,
		model: options.model.id,
		runtime: { runtimeVersion: "pi-child", schemaVersion: 1 },
		createdAt: new Date().toISOString(),
		metadata: {
			runId: childRunId,
			parentRunId,
			childRunId,
			childAgentId: options.childAgentId,
			conversationId: options.parent.conversationId,
			role: "child",
		},
	};
	await options.persistence?.ensureSession?.(childContext.sessionId, sessionSetup);
	const events: SubpolarPiChildEvent[] = [];
	const onEvent: SubpolarPiEventSink = (event) => {
		const correlated = correlate(event, parentRunId, childRunId);
		events.push(correlated);
		options.onEvent?.(correlated);
	};

	const result = await executeSubpolarPiRun({
		...childContext,
		model: options.model,
		systemPrompt: options.instructions,
		tools: persistentChildTools(options.tools, childContext, options.persistence),
		signal: options.signal,
		history: options.history,
		modelRuntime: options.modelRuntime,
		credentials: options.credentials,
		nativeProviders: options.nativeProviders,
		onEvent,
		userMessage: options.instructions,
	});

	return {
		parentRunId,
		childRunId,
		childAgentId: options.childAgentId,
		message: result.message,
		events,
	};
}
