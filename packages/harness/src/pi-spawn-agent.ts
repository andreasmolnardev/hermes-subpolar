import { Type } from "@earendil-works/pi-ai";
import type { Model, Provider, CredentialStore } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
	SubpolarPiChildEventSink,
	SubpolarPiParentRunContext,
} from "./pi-child-session";
import type { SubpolarPiTool, SubpolarPiToolRequest, SubpolarPiToolResult } from "./pi-tools";
import { executeSubpolarPiChildRun } from "./pi-child-session";

export const SUBPOLAR_PI_SPAWN_AGENT_TOOL_NAME = "spawn_agent";

export interface SubpolarPiSpawnAgentRequest {
	readonly parent: SubpolarPiParentRunContext;
	readonly requestedAgentId: string;
	readonly task: string;
	readonly deadlineMs: number | undefined;
	readonly signal: AbortSignal | undefined;
}

/** A child definition resolved by Subpolar policy, never by Pi or the model. */
export interface SubpolarPiChildAgentDefinition {
	readonly childAgentId: string;
	readonly model: Model<any>;
	readonly instructions: string;
	readonly cwd: string;
	readonly tools: readonly SubpolarPiTool[];
	readonly modelRuntime?: ModelRuntime;
	readonly credentials?: CredentialStore;
	readonly nativeProviders?: readonly Provider[];
}

export interface SubpolarPiSpawnAgentOptions {
	/** Resolve the requested Agent and its already-authorized capability set. */
	readonly resolveAgent: (request: SubpolarPiSpawnAgentRequest) => Promise<SubpolarPiChildAgentDefinition>;
	/** Optional application permission check. A denial never invokes resolveAgent. */
	readonly authorize?: (request: SubpolarPiSpawnAgentRequest) => Promise<"allow" | "deny">;
	/** Maximum child lifetime. Requested deadlines are clamped to this value. */
	readonly maxDeadlineMs?: number;
	readonly onChildEvent?: SubpolarPiChildEventSink;
}

interface SpawnAgentParams {
	agentId: string;
	task: string;
	deadlineMs?: number;
}

function parseParams(params: unknown): SpawnAgentParams {
	if (typeof params !== "object" || params === null) throw new Error("spawn_agent parameters must be an object.");
	const value = params as Record<string, unknown>;
	if (typeof value.agentId !== "string" || value.agentId.trim() === "") throw new Error("spawn_agent requires agentId.");
	if (typeof value.task !== "string" || value.task.trim() === "") throw new Error("spawn_agent requires task.");
	if (value.deadlineMs !== undefined && (typeof value.deadlineMs !== "number" || !Number.isInteger(value.deadlineMs) || value.deadlineMs <= 0)) {
		throw new Error("spawn_agent deadlineMs must be a positive integer.");
	}
	return {
		agentId: value.agentId.trim(),
		task: value.task,
		...(value.deadlineMs === undefined ? {} : { deadlineMs: value.deadlineMs as number }),
	};
}

function boundedDeadline(requested: number | undefined, maximum: number | undefined): number | undefined {
	if (maximum !== undefined && (!Number.isFinite(maximum) || maximum <= 0)) {
		throw new Error("maxDeadlineMs must be a positive finite number.");
	}
	if (requested === undefined) return maximum;
	return maximum === undefined ? requested : Math.min(requested, maximum);
}

function abortReason(): Error {
	return new DOMException("The child agent was cancelled.", "AbortError");
}

function childSignal(
	parentSignal: AbortSignal | undefined,
	deadlineMs: number | undefined,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
	const controller = new AbortController();
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const abortFromParent = (): void => controller.abort(parentSignal?.reason ?? abortReason());
	if (parentSignal !== undefined) {
		parentSignal.addEventListener("abort", abortFromParent, { once: true });
		if (parentSignal.aborted) abortFromParent();
	}
	if (deadlineMs !== undefined) {
		timer = setTimeout(() => {
			timedOut = true;
			controller.abort(new DOMException("The child agent deadline was exceeded.", "TimeoutError"));
		}, deadlineMs);
	}
	return {
		signal: controller.signal,
		timedOut: () => timedOut,
		dispose: () => {
			if (timer !== undefined) clearTimeout(timer);
			parentSignal?.removeEventListener("abort", abortFromParent);
		},
	};
}

function textFromChildMessage(message: unknown): string {
	const content = typeof message === "object" && message !== null && "content" in message ? (message as { content?: unknown }).content : undefined;
	if (Array.isArray(content)) {
		const text = content
			.filter((part): part is { type: "text"; text: string } => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string")
			.map(part => part.text)
			.join("");
		if (text !== "") return text;
	}
	return JSON.stringify(message);
}

function childToolResult(result: { readonly childRunId: string; readonly childAgentId: string; readonly parentRunId: string; readonly message: unknown }): SubpolarPiToolResult {
	return {
		content: [{ type: "text", text: textFromChildMessage(result.message ?? { content: "" }) }],
		details: {
			parentRunId: result.parentRunId,
			childRunId: result.childRunId,
			childAgentId: result.childAgentId,
		},
	};
}

/**
 * Create the only Pi-visible entry point for child Agents. Resolution,
 * authorization, capability filtering, and lifecycle all remain application
 * owned; the model supplies only an Agent id and task.
 */
export function createSubpolarPiSpawnAgentTool(options: SubpolarPiSpawnAgentOptions): SubpolarPiTool {
	return {
		name: SUBPOLAR_PI_SPAWN_AGENT_TOOL_NAME,
		label: "Spawn agent",
		description: "Run an authorized Subpolar Agent in an isolated child session and return its result.",
		parameters: Type.Object({
			agentId: Type.String({ minLength: 1 }),
			task: Type.String({ minLength: 1 }),
			deadlineMs: Type.Optional(Type.Integer({ minimum: 1 })),
		}),
		authorize: async ({ run, params, signal }: SubpolarPiToolRequest) => {
			let parsed: SpawnAgentParams;
			try {
				parsed = parseParams(params);
			} catch {
				return "deny";
			}
			return (await options.authorize?.({
				parent: run,
				requestedAgentId: parsed.agentId,
				task: parsed.task,
				deadlineMs: boundedDeadline(parsed.deadlineMs, options.maxDeadlineMs),
				signal,
			}) ?? "allow");
		},
		execute: async ({ run, params, signal }) => {
			const parsed = parseParams(params);
			const deadlineMs = boundedDeadline(parsed.deadlineMs, options.maxDeadlineMs);
			const child = childSignal(signal, deadlineMs);
			try {
				const request: SubpolarPiSpawnAgentRequest = {
					parent: run,
					requestedAgentId: parsed.agentId,
					task: parsed.task,
					deadlineMs,
					signal: child.signal,
				};
				if (child.signal.aborted) {
					if (signal?.aborted) throw signal.reason ?? abortReason();
					return { content: [{ type: "text", text: "Child agent deadline exceeded before resolution." }], details: { deadlineExceeded: true }, isError: true };
				}
				const definition = await options.resolveAgent(request);
				if (definition.childAgentId.trim() === "") throw new Error("Resolved child Agent has no id.");
				if (definition.instructions.trim() === "") throw new Error("Resolved child Agent has no instructions.");
				if (child.signal.aborted) {
					if (signal?.aborted) throw signal.reason ?? abortReason();
					return { content: [{ type: "text", text: "Child agent deadline exceeded before execution." }], details: { deadlineExceeded: true }, isError: true };
				}
				const result = await executeSubpolarPiChildRun({
					parent: run,
					childAgentId: definition.childAgentId,
					model: definition.model,
					instructions: `${definition.instructions}\n\nTask:\n${parsed.task}`,
					cwd: definition.cwd,
					// A child can never recursively acquire the parent spawn capability.
					tools: definition.tools.filter(tool => tool.name !== SUBPOLAR_PI_SPAWN_AGENT_TOOL_NAME),
					signal: child.signal,
					modelRuntime: definition.modelRuntime,
					credentials: definition.credentials,
					nativeProviders: definition.nativeProviders,
					onEvent: options.onChildEvent,
				});
				return childToolResult(result);
			} catch (error) {
				if (signal?.aborted) throw signal.reason ?? abortReason();
				if (child.timedOut()) return { content: [{ type: "text", text: "Child agent deadline exceeded." }], details: { deadlineExceeded: true }, isError: true };
				throw error;
			} finally {
				child.dispose();
			}
		},
	};
}
