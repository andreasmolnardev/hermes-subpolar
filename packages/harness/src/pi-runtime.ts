import {
	AgentSession,
	ModelRuntime,
	SessionManager,
	createAgentSession,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, type Model, type Provider } from "@earendil-works/pi-ai";
import type { CredentialStore } from "@earendil-works/pi-ai";
import type { ProviderMessage } from "chat-provider-interface";
import { PiEventProjector, type SubpolarPiEvent, type SubpolarPiEventSink } from "./pi-events";
import { SubpolarResourceLoader, type SubpolarPiResourceOptions } from "./pi-resources";
import { toPiToolDefinition, type SubpolarPiRunContext, type SubpolarPiTool } from "./pi-tools";

export interface CreateSubpolarPiRuntimeOptions extends SubpolarPiRunContext, SubpolarPiResourceOptions {
	readonly model: Model<any>;
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
	prompt(message: string): Promise<void>;
	subscribe(listener: AgentSessionEventListener): () => void;
	close(): void;
}

export interface ExecuteSubpolarPiRunOptions extends CreateSubpolarPiRuntimeOptions {
	readonly history?: readonly ProviderMessage[];
	readonly userMessage: string;
}

export interface SubpolarPiRunResult {
	readonly message: AgentSession["messages"][number] | undefined;
	readonly events: readonly SubpolarPiEvent[];
}

export async function createSubpolarPiRuntime(options: CreateSubpolarPiRuntimeOptions): Promise<SubpolarPiRuntime> {
	const modelRuntime = options.modelRuntime ??
		(await ModelRuntime.create({
			credentials: options.credentials ?? new InMemoryCredentialStore(),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
			...(options.signal ? { signal: options.signal } : {}),
		}));
	for (const provider of options.nativeProviders ?? []) modelRuntime.registerNativeProvider(provider);
	const sessionManager = SessionManager.inMemory(options.cwd, { id: options.sessionId });
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

	return {
		run: options,
		modelRuntime,
		session,
		events,
		prompt: (message) => session.prompt(message),
		subscribe: (listener) => session.subscribe(listener),
		close: () => unsubscribe(),
	};
}

/** Execute one application-owned Pi turn after hydrating the approved history. */
export async function executeSubpolarPiRun(options: ExecuteSubpolarPiRunOptions): Promise<SubpolarPiRunResult> {
	const runtime = await createSubpolarPiRuntime(options);
	const { hydratePiSession } = await import("./pi-messages");
	hydratePiSession(runtime.session, options.history ?? [], options.model);
	try {
		await runtime.prompt(options.userMessage);
		return { message: runtime.session.messages.at(-1), events: [...runtime.events] };
	} finally {
		runtime.close();
	}
}
