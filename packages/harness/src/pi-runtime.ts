import {
	AgentSession,
	ModelRuntime,
	SessionManager,
	createAgentSession,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, type ImageContent, type Model, type Provider } from "@earendil-works/pi-ai";
import type { CredentialStore } from "@earendil-works/pi-ai";
import type { ProviderMessage } from "chat-provider-interface";
import { PiEventProjector, type SubpolarPiEvent, type SubpolarPiEventSink } from "./pi-events";
import { SubpolarResourceLoader, type SubpolarPiResourceOptions } from "./pi-resources";
import { toPiToolDefinition, type SubpolarPiRunContext, type SubpolarPiTool } from "./pi-tools";
import { IterationBudget, type IterationBudgetLimits, type IterationBudgetResource } from "./iteration-budget";

export interface CreateSubpolarPiRuntimeOptions extends SubpolarPiRunContext, SubpolarPiResourceOptions {
	readonly model: Model<any>;
	/** Optional Pi JSONL session file used for process-restart hydration. */
	readonly sessionFile?: string;
	readonly tools?: readonly SubpolarPiTool[];
	readonly thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	readonly modelRuntime?: ModelRuntime;
	readonly credentials?: CredentialStore;
	/** Native providers registered by the Subpolar model/credential layer. */
	readonly nativeProviders?: readonly Provider[];
	readonly signal?: AbortSignal;
	readonly onEvent?: SubpolarPiEventSink;
}

export interface SubpolarPiRuntime {
	readonly run: SubpolarPiRunContext;
	readonly modelRuntime: ModelRuntime;
	readonly session: AgentSession;
	readonly events: readonly SubpolarPiEvent[];
	prompt(message: string, images?: readonly ImageContent[]): Promise<void>;
	subscribe(listener: AgentSessionEventListener): () => void;
	/** Abort the active Pi operation and wait until its session is idle. */
	abort(): Promise<void>;
	/** Abort any active work, remove listeners, and wait for the session to settle. */
	close(): Promise<void>;
}

export interface ExecuteSubpolarPiRunOptions extends CreateSubpolarPiRuntimeOptions {
	readonly history?: readonly ProviderMessage[];
	readonly userMessage: string;
	readonly userImages?: readonly ImageContent[];
	readonly budgets?: IterationBudgetLimits;
	readonly timeoutMs?: number;
	readonly deadline?: number;
}

export interface SubpolarPiRunResult {
	readonly message: AgentSession["messages"][number] | undefined;
	readonly events: readonly SubpolarPiEvent[];
}

export class SubpolarPiBudgetError extends Error {
	readonly code = "budget_exhausted" as const;
	constructor(readonly resource: IterationBudgetResource, readonly limit: number) {
		super(`Pi ${resource} budget exhausted at ${limit}.`);
		this.name = "SubpolarPiBudgetError";
	}
}

export class SubpolarPiTimeoutError extends Error {
	readonly code = "timed_out" as const;
	constructor(readonly deadline?: number) {
		super("Pi run deadline exceeded.");
		this.name = "SubpolarPiTimeoutError";
	}
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

export async function createSubpolarPiRuntime(options: CreateSubpolarPiRuntimeOptions): Promise<SubpolarPiRuntime> {
	throwIfAborted(options.signal);
	const modelRuntime = options.modelRuntime ??
		(await ModelRuntime.create({
			credentials: options.credentials ?? new InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
			...(options.signal ? { signal: options.signal } : {}),
		}));
	for (const provider of options.nativeProviders ?? []) modelRuntime.registerNativeProvider(provider);
	const sessionManager = options.sessionFile
		? SessionManager.open(options.sessionFile, undefined, options.cwd)
		: SessionManager.inMemory(options.cwd, { id: options.sessionId });
	const resourceLoader = new SubpolarResourceLoader(options);
	const events: SubpolarPiEvent[] = [];
	const sink: SubpolarPiEventSink = (event) => {
		events.push(event);
		options.onEvent?.(event);
	};
	const projector = new PiEventProjector(options.runId, sink);
	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir: options.agentDir,
		modelRuntime,
		model: options.model,
		...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
		noTools: "all",
		tools: options.tools?.map(tool => tool.name) ?? [],
		customTools: options.tools?.map((tool) => toPiToolDefinition(tool, options)),
		resourceLoader,
		sessionManager,
	});
	const unsubscribe = session.subscribe((event) => projector.project(event));
	let abortPromise: Promise<void> | undefined;
	let closePromise: Promise<void> | undefined;
	let closed = false;
	const abort = (): Promise<void> => {
		abortPromise ??= session.abort();
		return abortPromise;
	};
	const onAbort = (): void => {
		void abort().catch(() => undefined);
	};
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) onAbort();
	const close = (): Promise<void> => {
		if (closePromise) return closePromise;
		closed = true;
		options.signal?.removeEventListener("abort", onAbort);
		closePromise = abort().finally(() => unsubscribe());
		return closePromise;
	};

	return {
		run: options,
		modelRuntime,
		session,
		events,
		prompt: async (message, images) => {
			if (closed) throw new Error("The Pi runtime is closed.");
			throwIfAborted(options.signal);
			await session.prompt(message, images === undefined || images.length === 0 ? undefined : { images: [...images] });
			throwIfAborted(options.signal);
		},
		subscribe: (listener) => session.subscribe(listener),
		abort,
		close,
	};
}

/** Execute one application-owned Pi turn after hydrating the approved history. */
export async function executeSubpolarPiRun(options: ExecuteSubpolarPiRunOptions): Promise<SubpolarPiRunResult> {
	const controller = new AbortController();
	const abortFromCaller = (): void => controller.abort(options.signal?.reason);
	options.signal?.addEventListener("abort", abortFromCaller, { once: true });
	if (options.signal?.aborted) abortFromCaller();
	const deadline = options.deadline ?? (options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs);
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	let terminalError: SubpolarPiBudgetError | SubpolarPiTimeoutError | undefined;
	const timedOut = (): void => {
		if (terminalError !== undefined) return;
		terminalError = new SubpolarPiTimeoutError(deadline);
		options.onEvent?.({ type: "run.timed_out", runId: options.runId, ...(deadline === undefined ? {} : { deadline }) });
		controller.abort(terminalError);
	};
	if (deadline !== undefined) {
		if (!Number.isFinite(deadline)) throw new RangeError("Pi deadline must be finite.");
		const remaining = deadline - Date.now();
		if (remaining <= 0) timedOut();
		else timeoutHandle = setTimeout(timedOut, remaining);
	}
	let runtime: SubpolarPiRuntime | undefined;
	try {
		runtime = await createSubpolarPiRuntime({ ...options, signal: controller.signal });
		const budget = new IterationBudget(options.budgets ?? {});
		const stopForBudget = (resource: IterationBudgetResource): void => {
			const limits: Record<IterationBudgetResource, number | undefined> = {
				turns: budget.maxTurns,
				providerCalls: budget.maxProviderCalls,
				toolCalls: budget.maxToolCalls,
				tokens: budget.maxTokens,
			};
			const limit = limits[resource];
			if (limit === undefined || terminalError !== undefined) return;
			terminalError = new SubpolarPiBudgetError(resource, limit);
			// Emit before aborting so transports receive the stable terminal reason.
			const event = resource === "turns" || resource === "providerCalls" || resource === "toolCalls" || resource === "tokens"
				? { type: "run.budget_exhausted" as const, runId: options.runId, resource, limit }
				: undefined;
			if (event !== undefined) options.onEvent?.(event);
			controller.abort(terminalError);
		};
		const unsubscribeBudget = runtime.subscribe((event) => {
			if (event.type === "turn_start") {
				if (!budget.tryConsume("turns").allowed) return stopForBudget("turns");
				if (!budget.tryConsume("providerCalls").allowed) return stopForBudget("providerCalls");
			}
			if (event.type === "tool_execution_start" && !budget.tryConsume("toolCalls").allowed) stopForBudget("toolCalls");
			if (event.type === "message_end" && event.message.role === "assistant") {
				const tokens = event.message.usage.totalTokens;
				if (tokens > 0 && !budget.tryConsume("tokens", tokens).allowed) stopForBudget("tokens");
			}
		});
		try {
			const { hydratePiSession } = await import("./pi-messages");
			if (runtime.session.messages.length === 0 && (options.history?.length ?? 0) > 0) {
				hydratePiSession(runtime.session, options.history ?? [], options.model, { persist: Boolean(options.sessionFile) });
			}
			await runtime.prompt(options.userMessage, options.userImages);
			if (terminalError !== undefined) throw terminalError;
			return { message: runtime.session.messages.at(-1), events: [...runtime.events] };
		} finally {
			unsubscribeBudget();
		}
	} finally {
		if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
		options.signal?.removeEventListener("abort", abortFromCaller);
		await runtime?.close();
	}
}
