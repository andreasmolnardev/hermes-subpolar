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
		tools: [],
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
